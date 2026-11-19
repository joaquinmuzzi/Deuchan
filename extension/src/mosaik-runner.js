/**
 * Keeps the sending to Mosaik going: what it stores, when it sends, and what it does with the answers.
 * It is the one place that knows what is kept about Mosaik in the storage of the browser:
 *
 * - `mosaikSettings`      `{ enabled, url, token }`, off until the person turns it on in the dashboard;
 *                         `token` is the device token a Mosaik server needs (null for the hub here)
 * - `mosaikOutbox`        the events waiting to be sent (see `mosaik-events.js`)
 * - `mosaikSentDays`      `{ "<day>": seconds }`, the last total of each day put in the queue
 * - `mosaikState`         what the last sending did, for the panel
 * - `mosaikBackfilledAt`  when the history was sent, the first time
 * - `mosaikDays`          what Mosaik says of the days of every computer (see `mosaik-days.js`)
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
import {
  DEFAULT_HUB_URL,
  checkDevice,
  checkHealth,
  fetchDays,
  hubOrigins,
  isLocalHub,
  normalizeHubUrl,
  normalizeToken,
  sendBatch,
} from "./mosaik-client.js";
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
import { migrate, shownLog } from "./log.js";
import { REFRESH_MS, cleanDaysAnswer, dayRange, readMosaikDays } from "./mosaik-days.js";

/** The name Mosaik gives to the computer it runs on, when nothing sends a token. */
export const LOCAL_DEVICE = "principal";

export const MOSAIK_ALARM = "deuchan-mosaik";
const PERIOD_MINUTES = 1;

/** The events of one request; smaller ones are tried if the hub says it is too much. */
export const BATCH_SIZE = 200;

/** The most requests in one sending: the rest waits for the next one. */
const MAX_REQUESTS = 30;

/** The settings as they were saved, or the default ones: off, at the default address, with no token. */
export function readMosaikSettings(saved) {
  return {
    enabled: saved?.enabled === true,
    url: normalizeHubUrl(saved?.url) ?? DEFAULT_HUB_URL,
    token: normalizeToken(saved?.token),
  };
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
  if (result.kind === "unauthorized") {
    return "token-invalid";
  }
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
   * does not show what was sent last: today as it grows, a corrected day. Only the time of this
   * computer: Mosaik adds the computers up. With `all`, every day goes again: that is the history.
   */
  const prepare = ({ all = false } = {}) =>
    exclusive(async () => {
      const stored = await storage.get(["mosaikOutbox", "mosaikSentDays", "log", "videos"]);
      const at = now();
      const shown = shownLog(migrate(stored.log)).days;
      const sent = { ...stored.mosaikSentDays };
      const events = all
        ? backfillEvents(shown, stored.videos, at, sent)
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
    const { enabled, url, token } = await settings();
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
      const result = await sendBatch({ baseUrl: url, events: batch, token, fetchImpl, timeoutMs });
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

  /** The name Mosaik gives to this computer: the one of its token, or the computer of the hub. */
  async function ownDevice(url, token) {
    if (!token) {
      return LOCAL_DEVICE;
    }
    const device = await checkDevice({ baseUrl: url, token, fetchImpl, timeoutMs });
    return device.ok && device.device ? device.device : null;
  }

  /**
   * Asks Mosaik for the days of every computer, at most every few minutes unless `force`. Nothing is
   * lost when it cannot answer: the last answer stays, and without one the time of this computer is
   * shown alone.
   */
  async function refreshDays(force = false) {
    const { enabled, url, token } = await settings();
    if (!enabled) {
      return { skipped: "off" };
    }
    const saved = readMosaikDays((await storage.get("mosaikDays")).mosaikDays);
    if (!force && now() - saved.fetchedAt < REFRESH_MS) {
      return { skipped: "fresh" };
    }
    if (!(await permissions.contains({ origins: hubOrigins(url) }))) {
      return { error: "permission-missing" };
    }
    const device = saved.device ?? (await ownDevice(url, token));
    const today = new Date(now());
    const result = await fetchDays({ baseUrl: url, token, ...dayRange(today), fetchImpl, timeoutMs });
    if (!result.ok) {
      await setState({ daysError: result.error });
      return { error: result.error };
    }
    await storage.set({
      mosaikDays: { fetchedAt: now(), device, days: cleanDaysAnswer(result.body, today) },
    });
    await setState({ daysError: null });
    return { ok: true };
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

    /** Asks Mosaik for the days of every computer; with `force`, even if it asked a moment ago. */
    refreshDays: (force) => serialized(() => refreshDays(force)),

    /**
     * Turns it on, at the hub on this computer or at a Mosaik server (which needs this computer's device
     * token). The dashboard asks the person for the permission first; without it, it stays off. A server
     * that refuses the token leaves it off too. The first time, the history goes too.
     */
    enable: (text, tokenText) =>
      serialized(async () => {
        const url = normalizeHubUrl(text);
        if (!url) {
          return { error: "invalid-url" };
        }
        const token = normalizeToken(tokenText);
        if (!isLocalHub(url) && !token) {
          return { error: "token-missing" };
        }
        if (!(await permissions.contains({ origins: hubOrigins(url) }))) {
          return { error: "permission-missing" };
        }
        if (token) {
          // A wrong token is said now, not after the first sending fails
          const device = await checkDevice({ baseUrl: url, token, fetchImpl, timeoutMs });
          if (!device.ok && device.error === "token-invalid") {
            return { error: "token-invalid" };
          }
        }
        await storage.set({ mosaikSettings: { enabled: true, url, token } });
        // Another address or token can be another computer for Mosaik
        await storage.remove("mosaikDays");
        await schedule();
        const health = await checkHealth({ baseUrl: url, fetchImpl, timeoutMs });
        await setState({ status: "waiting", hubVersion: health.ok ? health.version : null, lastError: null });
        const { mosaikBackfilledAt } = await storage.get("mosaikBackfilledAt");
        const result = mosaikBackfilledAt ? await send() : await backfill();
        await refreshDays(true);
        return { health, ...result };
      }),

    /** Turns it off: no more events are kept, and the ones waiting are forgotten. */
    disable: () =>
      serialized(async () => {
        const { url, token } = await settings();
        await storage.set({ mosaikSettings: { enabled: false, url, token } });
        await schedule();
        // The totals sent are forgotten too: turned on again, every day is sent as it is then
        await exclusive(() => storage.remove(["mosaikOutbox", "mosaikSentDays", "mosaikDays"]));
        await storage.set({ mosaikState: { status: "off" } });
        return {};
      }),

    /**
     * Whether Mosaik answers, at the address given or the saved one; for a server, also whether it takes
     * the token, and as which device.
     */
    test: (text, tokenText) =>
      serialized(async () => {
        const saved = await settings();
        const url = text === undefined ? saved.url : normalizeHubUrl(text);
        if (!url) {
          return { ok: false, error: "invalid-url" };
        }
        const token = tokenText === undefined ? saved.token : normalizeToken(tokenText);
        if (!isLocalHub(url) && !token) {
          return { ok: false, error: "token-missing" };
        }
        if (!(await permissions.contains({ origins: hubOrigins(url) }))) {
          return { ok: false, error: "permission-missing" };
        }
        const health = await checkHealth({ baseUrl: url, fetchImpl, timeoutMs });
        if (!health.ok) {
          return health;
        }
        await setState({ hubVersion: health.version });
        if (!token) {
          return health;
        }
        const device = await checkDevice({ baseUrl: url, token, fetchImpl, timeoutMs });
        return device.ok ? { ...health, device: device.device } : device;
      }),

    /** An alarm went off. */
    async onAlarm(name) {
      if (name === MOSAIK_ALARM) {
        await serialized(send);
        await serialized(() => refreshDays());
      }
    },
  };
}
