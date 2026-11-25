/**
 * Keeps "Send to Kechimochi" going: what it stores, when it sends, and what it does with the answers. It
 * is the one place that knows what is kept about Kechimochi in the storage of the browser:
 *
 * - `kechimochiSettings`  `{ enabled, url }`, off until the person turns it on in the dashboard
 * - `kechimochiSent`      what was sent, per day and item (see `readSent` in kechimochi-map.js)
 * - `kechimochiState`     what the last sending did, for the panel
 *
 * Every few minutes, and when asked, it works out the rows of every day (kechimochi-map.js) and sends
 * what changed since the last time: a new log for a new row, the new minutes for a row that grew, a
 * deletion for a row that is gone. Only the time of this computer, as with Mosaik.
 *
 * Kechimochi does not take a batch, so each row is one request; what was done is kept after each one, so
 * a sending stopped halfway goes on where it was. A new log carries a marker in its notes (`logMarker`),
 * and before making new ones the logs of Kechimochi are read: a log whose answer was lost is found there
 * instead of being made twice. A log the person deleted in Kechimochi is left deleted.
 *
 * The storage, the alarms, the permissions and the way to reach Kechimochi are given from outside, so it
 * is tested with no browser.
 */
import {
  DEFAULT_KECHIMOCHI_URL,
  kechimochiClient,
  kechimochiOrigins,
  normalizeKechimochiUrl,
} from "./kechimochi-client.js";
import {
  allDays,
  languageName,
  logMarker,
  markedKey,
  mediaKey,
  planSync,
  readSent,
} from "./kechimochi-map.js";
import { migrate } from "./log.js";
import { TARGET_KEY, targetOf } from "./target.js";

export const KECHIMOCHI_ALARM = "deuchan-kechimochi";

/** Today's minutes change once a minute at most; every few minutes is enough for a tracker of days. */
const PERIOD_MINUTES = 5;

/** The most requests in one sending (the history the first time is one per day and item): the rest waits. */
export const MAX_REQUESTS = 300;

/** The settings as they were saved, or the default ones: off, at Kechimochi's default address. */
export function readKechimochiSettings(saved) {
  return {
    enabled: saved?.enabled === true,
    url: normalizeKechimochiUrl(saved?.url) ?? DEFAULT_KECHIMOCHI_URL,
  };
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

/** The media entry Inputly makes for a row, with what Kechimochi asks for every new one. */
const newMedia = (row, language) => ({
  title: row.title,
  variant: row.variant,
  default_activity_type: row.activity,
  status: "Active",
  language,
  description: "",
  cover_image: "",
  extra_data: "{}",
  content_type: row.contentType,
  tracking_status: "Ongoing",
});

/** A failure that is about one row (Kechimochi refused it), not about reaching Kechimochi at all. */
const rowFailure = (result) => ["bad-request", "conflict", "not-found"].includes(result.error);

/**
 * @param {object} deps
 * @param {{ get: Function, set: Function, remove: Function }} deps.storage  as `chrome.storage.local`
 * @param {{ create: Function, clear: Function, get: Function }} deps.alarms  as `chrome.alarms`
 * @param {{ contains: Function }} deps.permissions  as `chrome.permissions`
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {number} [deps.timeoutMs]
 */
export function createKechimochiRunner({
  storage,
  alarms,
  permissions,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs,
}) {
  const serialized = serializer();
  const settings = async () =>
    readKechimochiSettings((await storage.get("kechimochiSettings")).kechimochiSettings);
  const client = (url) => kechimochiClient({ baseUrl: url, fetchImpl, ...(timeoutMs ? { timeoutMs } : {}) });

  async function setState(changes) {
    const { kechimochiState } = await storage.get("kechimochiState");
    await storage.set({ kechimochiState: { ...kechimochiState, ...changes } });
  }

  /** Makes the alarm match the settings: every few minutes while it is on, none while it is off. */
  async function schedule() {
    if ((await settings()).enabled) {
      if (!(await alarms.get(KECHIMOCHI_ALARM))) {
        await alarms.create(KECHIMOCHI_ALARM, { delayInMinutes: 1, periodInMinutes: PERIOD_MINUTES });
      }
    } else {
      await alarms.clear(KECHIMOCHI_ALARM);
    }
  }

  /**
   * Sends what changed. Returns `{ ok, created, updated, removed, refused }` or `{ error }`. Only this
   * writes `kechimochiSent`, and only one sending runs at a time (`serialized`).
   */
  async function send() {
    const { enabled, url } = await settings();
    if (!enabled) {
      return { skipped: "off" };
    }
    if (!(await permissions.contains({ origins: kechimochiOrigins(url) }))) {
      await setState({ status: "permission-missing", lastAttemptAt: now() });
      return { error: "permission-missing" };
    }
    const api = client(url);
    const stored = await storage.get(["log", "videos", "kechimochiSent", TARGET_KEY]);
    const sent = readSent(stored.kechimochiSent);
    const plan = planSync(allDays(migrate(stored.log), stored.videos), sent);
    const save = () => storage.set({ kechimochiSent: sent });
    for (const day of plan.seal) {
      sent[day] = true;
    }
    const counts = { created: 0, updated: 0, removed: 0, refused: 0 };
    let lastRefused = null;
    const finish = async (failure) => {
      await save();
      if (failure) {
        await setState({ status: failure.error, lastError: failure.detail || null, lastAttemptAt: now() });
        return { error: failure.error, ...counts };
      }
      const changed = counts.created + counts.updated + counts.removed > 0;
      await setState({
        status: "ok",
        lastError: counts.refused > 0 ? (lastRefused ?? null) : null,
        lastAttemptAt: now(),
        ...(changed ? { lastSentAt: now() } : {}),
      });
      return { ok: true, ...counts };
    };
    const refused = (result) => {
      counts.refused += 1;
      lastRefused = result.detail || result.error;
    };

    const work = plan.create.length + plan.update.length + plan.remove.length;
    if (work === 0) {
      // Nothing to send: whether Kechimochi is there is still worth saying in the panel
      const version = await api.version();
      if (!version.ok) {
        return finish(version);
      }
      await setState({ version: version.value });
      return finish(null);
    }
    await setState({ status: "sending", startedAt: now() });

    // The logs as Kechimochi has them: to find the ones whose answer was lost, and to change a log
    // without losing what the person wrote in it there
    const logs = await api.listLogs();
    if (!logs.ok) {
      return finish(logs);
    }
    const byId = new Map(logs.value.map((log) => [log.id, log]));
    const byMarker = new Map();
    for (const log of logs.value) {
      const key = markedKey(log.notes);
      if (key) {
        byMarker.set(`${log.date}\u0000${key}`, log);
      }
    }
    let requests = 1;
    const record = (day, key, entry) => {
      if (sent[day] === true) {
        return;
      }
      sent[day] = { ...sent[day], [key]: entry };
    };

    for (const row of plan.remove) {
      if (requests >= MAX_REQUESTS) {
        break;
      }
      if (row.log !== null && byId.has(row.log)) {
        requests += 1;
        const result = await api.deleteLog(row.log);
        if (!result.ok && !rowFailure(result)) {
          return finish(result);
        }
        counts.removed += 1;
      }
      delete sent[row.day][row.key];
      if (Object.keys(sent[row.day]).length === 0) {
        delete sent[row.day];
      }
    }

    /** The log with new minutes, and the rest as it is in Kechimochi. */
    const changedLog = (log, minutes) => ({
      media_id: log.media_id,
      duration_minutes: minutes,
      characters: log.characters ?? 0,
      date: log.date,
      date_precision: log.date_precision ?? "day",
      activity_type: log.activity_type ?? "",
      notes: log.notes ?? "",
    });

    for (const row of plan.update) {
      if (requests >= MAX_REQUESTS) {
        break;
      }
      const log = byId.get(row.log);
      if (!log) {
        // Deleted in Kechimochi by the person: left deleted
        record(row.day, row.key, { log: null, minutes: row.minutes });
        continue;
      }
      requests += 1;
      const result = await api.updateLog(row.log, changedLog(log, row.minutes));
      if (!result.ok) {
        if (!rowFailure(result)) {
          return finish(result);
        }
        refused(result);
        continue;
      }
      record(row.day, row.key, { log: row.log, minutes: row.minutes });
      counts.updated += 1;
    }

    // New logs need their media entries, found by exact title and variant or made
    let media = null;
    const language = languageName(targetOf(stored[TARGET_KEY]));
    for (const row of plan.create) {
      if (requests >= MAX_REQUESTS) {
        break;
      }
      const found = byMarker.get(`${row.day}\u0000${row.key}`);
      if (found) {
        // Made before, its answer lost (or sent before Inputly forgot what it sent): it is taken back
        if (found.duration_minutes !== row.minutes) {
          requests += 1;
          const result = await api.updateLog(found.id, changedLog(found, row.minutes));
          if (!result.ok) {
            if (!rowFailure(result)) {
              return finish(result);
            }
            refused(result);
            continue;
          }
          counts.updated += 1;
        }
        record(row.day, row.key, { log: found.id, minutes: row.minutes });
        if (row.seal) {
          sent[row.day] = true;
        }
        continue;
      }
      if (!media) {
        requests += 1;
        const list = await api.listMedia();
        if (!list.ok) {
          return finish(list);
        }
        media = new Map(list.value.map((entry) => [mediaKey(entry.title, entry.variant), entry.id]));
      }
      const key = mediaKey(row.title, row.variant);
      if (!media.has(key)) {
        requests += 1;
        const made = await api.addMedia(newMedia(row, language));
        if (!made.ok) {
          if (!rowFailure(made)) {
            return finish(made);
          }
          refused(made);
          // A conflict means it was made meanwhile: the list is read again for the next row
          media = null;
          continue;
        }
        media.set(key, made.value);
      }
      requests += 1;
      const result = await api.addLog({
        media_id: media.get(key),
        duration_minutes: row.minutes,
        characters: 0,
        date: row.day,
        date_precision: "day",
        activity_type: row.activity,
        notes: logMarker(row.key),
      });
      if (!result.ok) {
        if (!rowFailure(result)) {
          return finish(result);
        }
        refused(result);
        continue;
      }
      record(row.day, row.key, { log: result.value, minutes: row.minutes });
      if (row.seal) {
        sent[row.day] = true;
      }
      counts.created += 1;
      if (counts.created % 20 === 0) {
        // A long first sending keeps what it did as it goes
        await save();
      }
    }
    return finish(null);
  }

  /** Whether Kechimochi answers at that address. */
  async function check(url) {
    if (!(await permissions.contains({ origins: kechimochiOrigins(url) }))) {
      return { ok: false, error: "permission-missing" };
    }
    const version = await client(url).version();
    return version.ok ? { ok: true, version: version.value } : { ok: false, error: version.error };
  }

  return {
    schedule,

    /** A sending now, after what is running. */
    flush: () => serialized(send),

    /**
     * Turns it on at that address. The dashboard asks the person for the permission first; without it,
     * it stays off. Kechimochi does not need to be running: what is counted waits for it.
     */
    enable: (text) =>
      serialized(async () => {
        const url = normalizeKechimochiUrl(text);
        if (!url) {
          return { error: "invalid-url" };
        }
        if (!(await permissions.contains({ origins: kechimochiOrigins(url) }))) {
          return { error: "permission-missing" };
        }
        await storage.set({ kechimochiSettings: { enabled: true, url } });
        await schedule();
        const health = await check(url);
        await setState({ status: "waiting", version: health.ok ? health.version : null, lastError: null });
        return { health, ...(await send()) };
      }),

    /**
     * Turns it off. What was sent is forgotten, so that another address (another Kechimochi) gets every
     * day; turned on again at the same one, the markers of the logs keep anything from being sent twice.
     */
    disable: () =>
      serialized(async () => {
        const { url } = await settings();
        await storage.set({ kechimochiSettings: { enabled: false, url } });
        await schedule();
        await storage.remove("kechimochiSent");
        await storage.set({ kechimochiState: { status: "off" } });
        return {};
      }),

    /** Whether Kechimochi answers, at the address given or the saved one. */
    test: (text) =>
      serialized(async () => {
        const url = text === undefined ? (await settings()).url : normalizeKechimochiUrl(text);
        if (!url) {
          return { ok: false, error: "invalid-url" };
        }
        const result = await check(url);
        if (result.ok) {
          await setState({ version: result.version });
        }
        return result;
      }),

    /** An alarm went off. */
    async onAlarm(name) {
      if (name === KECHIMOCHI_ALARM) {
        await serialized(send);
      }
    },
  };
}
