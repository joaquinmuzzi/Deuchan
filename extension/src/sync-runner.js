/**
 * Keeps the sync going: when it starts, what it stores, and when it runs. It is the one place that
 * knows what is kept about sync in the storage of the browser:
 *
 * - `syncKey`    the sync key, as the person sees it (while sync is on)
 * - `deviceId`   this computer, made the first time it is needed
 * - `syncState`  what the last round did, for the panel: `{ status, lastSync, devices, error, retryAt }`
 *
 * and, from the sync itself, `others` (see `sync-data.js`). The storage, the alarms and the way to reach
 * the server are given from outside, so it is tested against the real server with no browser.
 *
 * Rounds run one after the other. They start every few minutes, a little after the time of this
 * computer changes, and when the person asks. If the server says "too many requests", the automatic
 * ones wait until it said they could (`retryAt`); a person who asks is never made to wait.
 */
import { SyncError, createClient } from "./sync-client.js";
import { deriveKeys, formatSyncKey, newSyncKey, parseSyncKey } from "./sync-crypto.js";
import { newDeviceId } from "./sync-data.js";
import { syncOnce } from "./sync-engine.js";

export const PERIODIC_ALARM = "deuchan-sync";
export const SOON_ALARM = "deuchan-sync-soon";
const PERIOD_MINUTES = 5;
/** After the time of this computer changes, the sync waits this long, so a video does not cause a round each second. */
const SOON_MINUTES = 1;

/**
 * @param {object} deps
 * @param {{ get: Function, set: Function, remove: Function }} deps.storage  as `chrome.storage.local`
 * @param {{ create: Function, clear: Function, get: Function }} deps.alarms  as `chrome.alarms`
 * @param {string} deps.baseUrl
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 */
export function createSyncRunner({ storage, alarms, baseUrl, fetchImpl = globalThis.fetch, now = Date.now }) {
  let queue = Promise.resolve();

  /** Runs `task` after the ones before it, whatever happened to them. */
  const serialized = (task) => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };

  const setState = (state) => storage.set({ syncState: state });

  async function ensureDeviceId() {
    const { deviceId } = await storage.get("deviceId");
    if (typeof deviceId === "string") {
      return deviceId;
    }
    const created = newDeviceId();
    await storage.set({ deviceId: created });
    return created;
  }

  async function clientFor(text) {
    const { token, key } = await deriveKeys(parseSyncKey(text));
    return { key, client: createClient({ baseUrl, token, fetchImpl }) };
  }

  /** Makes the alarms match the settings: periodic ones while there is a key, none without it. */
  async function schedule() {
    const { syncKey } = await storage.get("syncKey");
    if (syncKey) {
      await alarms.create(PERIODIC_ALARM, {
        delayInMinutes: PERIOD_MINUTES,
        periodInMinutes: PERIOD_MINUTES,
      });
    } else {
      await alarms.clear(PERIODIC_ALARM);
      await alarms.clear(SOON_ALARM);
    }
  }

  async function round({ mustExist = false, manual = false } = {}) {
    const stored = await storage.get(["syncKey", "syncState", "log", "others"]);
    if (!stored.syncKey) {
      return { skipped: "off" };
    }
    if (!manual && stored.syncState?.retryAt > now()) {
      return { skipped: "waiting" };
    }
    const previous = stored.syncState ?? {};
    await setState({ ...previous, status: "syncing", startedAt: now() });
    try {
      const deviceId = await ensureDeviceId();
      const { client, key } = await clientFor(stored.syncKey);
      const result = await syncOnce({
        client,
        key,
        deviceId,
        log: stored.log,
        others: stored.others,
        mustExist,
      });
      await storage.set({ others: result.others });
      await setState({
        status: "ok",
        lastSync: now(),
        devices: result.devices,
        error: null,
        detail: null,
        retryAt: null,
      });
      return { ok: true, uploaded: result.uploaded, devices: result.devices };
    } catch (error) {
      const kind = error instanceof SyncError ? error.kind : "unknown";
      await setState({
        ...previous,
        status: "error",
        error: kind,
        // What happened, in a few words, for whoever has to find out why: the panel shows it as a hint
        detail: String(error?.message ?? "").slice(0, 200),
        retryAt: kind === "rate-limited" ? now() + (error.retryAfter ?? 60) * 1000 : null,
      });
      throw error instanceof SyncError ? error : new SyncError("unknown", "sync failed");
    }
  }

  /** A round, after the ones that are running. Errors are in the state of the panel and in the result. */
  const run = (options) =>
    serialized(() => round(options).catch((error) => ({ error: error.kind ?? "unknown" })));

  return {
    ensureDeviceId,
    schedule,
    run,

    /** Turns sync on with a new key, which is returned for the person to keep, and syncs. */
    create: () =>
      serialized(async () => {
        const text = newSyncKey();
        await storage.set({ syncKey: text });
        await ensureDeviceId();
        await schedule();
        const result = await round({ manual: true }).catch((error) => ({ error: error.kind ?? "unknown" }));
        return { key: text, ...result };
      }),

    /**
     * Turns sync on with the key of another computer. If the key is not one, or the server has no data
     * for it, nothing is left behind: a typing mistake must not start an empty copy.
     */
    join: (text) =>
      serialized(async () => {
        const normal = formatSyncKey(text);
        if (!normal) {
          return { error: "invalid-key" };
        }
        await storage.set({ syncKey: normal });
        await ensureDeviceId();
        const result = await round({ mustExist: true, manual: true }).catch((error) => ({
          error: error.kind ?? "unknown",
        }));
        if (result.error) {
          await storage.remove(["syncKey", "syncState"]);
          return result;
        }
        await schedule();
        return { key: normal, ...result };
      }),

    /** Stops syncing on this computer. What was synced stays here and on the server. */
    disable: () =>
      serialized(async () => {
        await storage.remove(["syncKey", "syncState"]);
        await schedule();
      }),

    /** Deletes the copy on the server, and then stops syncing. If the server cannot be reached nothing changes. */
    erase: () =>
      serialized(async () => {
        const { syncKey } = await storage.get("syncKey");
        if (!syncKey) {
          return {};
        }
        try {
          const { client } = await clientFor(syncKey);
          await client.remove();
        } catch (error) {
          return { error: error instanceof SyncError ? error.kind : "unknown" };
        }
        await storage.remove(["syncKey", "syncState"]);
        await schedule();
        return {};
      }),

    /** The time of this computer changed: sync a little later, once, not for every second. */
    async soon() {
      const { syncKey } = await storage.get("syncKey");
      if (syncKey && !(await alarms.get(SOON_ALARM))) {
        await alarms.create(SOON_ALARM, { delayInMinutes: SOON_MINUTES });
      }
    },

    /** An alarm went off. */
    async onAlarm(name) {
      if (name === PERIODIC_ALARM || name === SOON_ALARM) {
        await run();
      }
    },
  };
}
