/**
 * Keeps the sending to Mosaik going: what it stores, when it sends, and what it does with the answers.
 * It is the one place that knows what is kept about Mosaik in the storage of the browser:
 *
 * - `mosaikSettings`      `{ enabled, url }`, off until the person turns it on in the dashboard
 * - `mosaikOutbox`        the events waiting to be sent (see `mosaik-events.js`)
 * - `mosaikSentDays`      `{ "<day>": seconds }`, the last total of each day put in the queue
 * - `mosaikState`         what the last sending did, for the panel
 * - `mosaikBackfilledAt`  when the history was sent, the first time
 *
 * The storage, the alarms, the permissions and the way to reach the hub are given from outside, so it
 * is tested with no browser.
 *
 * The queue is also written by the background script, while it counts time, so every change to it goes
 * through `exclusive`, the single writer of the background script: the batch is taken in it, sent out of
 * it, and the queue is read again in it to take out what was sent, by id. A copy of the queue read before
 * the request is never written back. The service worker can stop at any moment, so nothing that matters
 * is kept only in memory.
 */
import { DEFAULT_HUB_URL, checkHealth, hubOrigins, normalizeHubUrl, sendBatch } from "./mosaik-client.js";
import {
  addToQueue,
  addWatched,
  backfillEvents,
  changedDays,
  closeIdle,
  dayTotalEvent,
  pendingCount,
  readOutbox,
  removeSent,
  takeBatch,
  videoRemovedEvent,
} from "./mosaik-events.js";
import { migrate } from "./log.js";
import { effectiveLog } from "./sync-data.js";

export const MOSAIK_ALARM = "deuchan-mosaik";
const PERIOD_MINUTES = 1;

/** The events of one request; smaller ones are tried if the hub says it is too much. */
export const BATCH_SIZE = 200;

/** The most requests in one sending: the rest waits for the next one. */
const MAX_REQUESTS = 30;

/** The settings as they were saved, or the default ones: off, at the default address. */
export function readMosaikSettings(saved) {
  return { enabled: saved?.enabled === true, url: normalizeHubUrl(saved?.url) ?? DEFAULT_HUB_URL };
}

/**
 * For the background script, in the same read and write as the log: the queue with what was just
 * counted, as `{ interval, newSeconds }` items of one video, or `null` when sending to Mosaik is off and
 * nothing is to be kept.
 */
export function queueWatched(stored, counted, video, randomUUID) {
  if (!readMosaikSettings(stored.mosaikSettings).enabled) {
    return null;
  }
  let outbox = readOutbox(stored.mosaikOutbox);
  for (const { interval, newSeconds } of counted) {
    outbox = addWatched(outbox, interval, newSeconds, video, randomUUID);
  }
  return outbox;
}

/** For the background script: the queue with a video taken out of a day, or `null` when it is off. */
export function queueRemoval(stored, day, videoId, at) {
  if (!readMosaikSettings(stored.mosaikSettings).enabled) {
    return null;
  }
  return addToQueue(readOutbox(stored.mosaikOutbox), [videoRemovedEvent(day, at, videoId)]);
}

/** What a failed request leaves as the status of the panel. */
function statusOf(result) {
  if (result.kind === "retry") {
    return result.error === "not-running" ? "not-running" : "error";
  }
  return (
    { outdated: "outdated", forbidden: "forbidden", "bad-request": "bad-request" }[result.kind] ?? "error"
  );
}

/** Runs tasks one after the other, whatever happened to the ones before. */
function serializer() {
  let queue = Promise.resolve();
  return (task) => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
}

/**
 * @param {object} deps
 * @param {{ get: Function, set: Function, remove: Function }} deps.storage  as `chrome.storage.local`
 * @param {{ create: Function, clear: Function, get: Function }} deps.alarms  as `chrome.alarms`
 * @param {{ contains: Function }} deps.permissions  as `chrome.permissions`
 * @param {(task: () => Promise<any>) => Promise<any>} [deps.exclusive]  the single writer of the queue
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {number} [deps.timeoutMs]
 */
export function createMosaikRunner({
  storage,
  alarms,
  permissions,
  exclusive = serializer(),
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs,
}) {
  // What the panel and the alarms ask for runs one at a time
  const serialized = serializer();

  const settings = async () => readMosaikSettings((await storage.get("mosaikSettings")).mosaikSettings);

  async function setState(changes) {
    const { mosaikState } = await storage.get("mosaikState");
    await storage.set({ mosaikState: { ...mosaikState, ...changes } });
  }

  const readQueue = async () => readOutbox((await storage.get("mosaikOutbox")).mosaikOutbox);

  /** Makes the alarm match the settings: every minute while it is on, none while it is off. */
  async function schedule() {
    if ((await settings()).enabled) {
      if (!(await alarms.get(MOSAIK_ALARM))) {
        await alarms.create(MOSAIK_ALARM, {
          delayInMinutes: PERIOD_MINUTES,
          periodInMinutes: PERIOD_MINUTES,
        });
      }
    } else {
      await alarms.clear(MOSAIK_ALARM);
    }
  }

  /**
   * Closes the open event if nothing came for it, and puts in the queue a new total of every day that
   * does not show what was sent last: today as it grows, a corrected day, a day another computer added
   * time to through sync. With `all`, every day goes again: that is the history.
   */
  const prepare = ({ all = false } = {}) =>
    exclusive(async () => {
      const stored = await storage.get(["mosaikOutbox", "mosaikSentDays", "log", "others", "videos"]);
      const at = now();
      const shown = effectiveLog(migrate(stored.log), stored.others).days;
      const sent = { ...stored.mosaikSentDays };
      const events = all
        ? backfillEvents(shown, stored.videos, at)
        : changedDays(shown, sent).map(({ day, seconds }) => dayTotalEvent(day, at, seconds, stored.videos));
      for (const event of events) {
        sent[event.day] = event.seconds;
      }
      const outbox = addToQueue(closeIdle(readOutbox(stored.mosaikOutbox), at), events);
      await storage.set({ mosaikOutbox: outbox, mosaikSentDays: sent });
      return { outbox, queued: events.length };
    });

  /** Sends what waits, batch after batch, until the queue is empty or the hub cannot take more. */
  async function send() {
    const { enabled, url } = await settings();
    if (!enabled) {
      return { skipped: "off" };
    }
    if (!(await permissions.contains({ origins: hubOrigins(url) }))) {
      await setState({ status: "permission-missing", lastAttemptAt: now() });
      return { error: "permission-missing" };
    }
    const { outbox } = await prepare();
    await setState({ status: "sending", startedAt: now(), pending: pendingCount(outbox) });

    let size = BATCH_SIZE;
    let sent = 0;
    let failure = null;
    const { mosaikState: before } = await storage.get("mosaikState");
    let rejected = before?.rejected ?? 0;
    let lastRejected = before?.lastRejected ?? null;
    for (let request = 0; request < MAX_REQUESTS; request += 1) {
      const batch = await exclusive(async () => takeBatch(await readQueue(), size));
      if (batch.length === 0) {
        break;
      }
      const result = await sendBatch({ baseUrl: url, events: batch, fetchImpl, timeoutMs });
      if (result.kind === "too-large" && size > 1) {
        size = Math.max(1, Math.floor(size / 2));
        continue;
      }
      if (result.kind !== "ok") {
        failure = result;
        break;
      }
      // Everything in the batch is done: accepted, already there, or refused for good
      await exclusive(async () => {
        const ids = batch.map((event) => event.id);
        await storage.set({ mosaikOutbox: removeSent(await readQueue(), ids) });
      });
      sent += batch.length;
      rejected += result.rejected.length;
      if (result.rejected.length > 0) {
        // Refused for good: they leave the queue, and the last reason stays for the panel
        const [first] = result.rejected;
        lastRejected = `${first.id}: ${first.error}`;
      }
    }

    const left = await readQueue();
    const common = {
      pending: pendingCount(left),
      dropped: left.dropped,
      rejected,
      lastRejected,
      lastAttemptAt: now(),
    };
    if (failure) {
      await setState({ ...common, status: statusOf(failure), lastError: failure.error });
      return { error: statusOf(failure), sent };
    }
    await setState({ ...common, status: "ok", lastError: null, ...(sent > 0 ? { lastSentAt: now() } : {}) });
    return { ok: true, sent };
  }

  /** The history: a total for every day the dashboard shows, then a sending. */
  async function backfill() {
    if (!(await settings()).enabled) {
      return { error: "off" };
    }
    const { queued } = await prepare({ all: true });
    await storage.set({ mosaikBackfilledAt: now() });
    return { queued, ...(await send()) };
  }

  return {
    schedule,

    /** A sending now, after what is running. */
    flush: () => serialized(send),

    /** Sends the history again, whatever was sent before. */
    backfill: () => serialized(backfill),

    /**
     * Turns it on, at an address on this computer. The dashboard asks the person for the permission
     * first; without it, it stays off. The first time, the history goes too.
     */
    enable: (text) =>
      serialized(async () => {
        const url = normalizeHubUrl(text);
        if (!url) {
          return { error: "invalid-url" };
        }
        if (!(await permissions.contains({ origins: hubOrigins(url) }))) {
          return { error: "permission-missing" };
        }
        await storage.set({ mosaikSettings: { enabled: true, url } });
        await schedule();
        const health = await checkHealth({ baseUrl: url, fetchImpl, timeoutMs });
        await setState({ status: "waiting", hubVersion: health.ok ? health.version : null, lastError: null });
        const { mosaikBackfilledAt } = await storage.get("mosaikBackfilledAt");
        const result = mosaikBackfilledAt ? await send() : await backfill();
        return { health, ...result };
      }),

    /** Turns it off: no more events are kept, and the ones waiting are forgotten. */
    disable: () =>
      serialized(async () => {
        const { url } = await settings();
        await storage.set({ mosaikSettings: { enabled: false, url } });
        await schedule();
        // The totals sent are forgotten too: turned on again, every day is sent as it is then
        await exclusive(() => storage.remove(["mosaikOutbox", "mosaikSentDays"]));
        await storage.set({ mosaikState: { status: "off" } });
        return {};
      }),

    /** Whether Mosaik answers, at the address given or the saved one. */
    test: (text) =>
      serialized(async () => {
        const url = text === undefined ? (await settings()).url : normalizeHubUrl(text);
        if (!url) {
          return { ok: false, error: "invalid-url" };
        }
        if (!(await permissions.contains({ origins: hubOrigins(url) }))) {
          return { ok: false, error: "permission-missing" };
        }
        const health = await checkHealth({ baseUrl: url, fetchImpl, timeoutMs });
        if (health.ok) {
          await setState({ hubVersion: health.version });
        }
        return health;
      }),

    /** An alarm went off. */
    async onAlarm(name) {
      if (name === MOSAIK_ALARM) {
        await serialized(send);
      }
    },
  };
}
