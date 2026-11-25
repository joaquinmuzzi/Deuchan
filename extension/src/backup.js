/**
 * Export and import of what Inputly keeps, as a JSON file the user saves and opens again.
 *
 * Extension storage belongs to one extension id, so moving to another browser, or from a build loaded
 * unpacked to the store build, starts from an empty history. A backup file carries it over, with no
 * server: `{ app: "inputly", exportedAt, version, storageVersion, data }`.
 *
 * Pure functions only; the dashboard reads and writes `chrome.storage.local` around them.
 */
import { STORAGE_VERSION, migrate, sanitizeAdjust, shownLog, totalSeconds } from "./log.js";
import { RANGES } from "./stats.js";
import { normalizeLanguage } from "./target.js";
import { isVideoId } from "./overrides.js";
import { MAX_VIDEOS_PER_DAY, MAX_VIDEO_DAYS, cleanVideo } from "./videos.js";
import { MAX_GOAL_MINUTES, MIN_GOAL_MINUTES } from "./goal.js";

export const APP_MARKER = "inputly";

/**
 * The keys a backup carries. Left out on purpose:
 * - `covered`, `manualSession`: the state of what is playing or being read right now.
 * - `mosaikSettings` (it holds the device token, a secret that must not end up in a file people pass
 *   around), `mosaikState`, `mosaikOutbox`, `mosaikDays`: Mosaik is set up again on the new browser, and
 *   its days come back from the server.
 * - `immersion`, `streamingSites`: they only work with permissions granted in that browser, so a
 *   restored "on" without its permission would count nothing. They are turned on again by hand.
 * - `kechimochiSettings`, `kechimochiSent`, `kechimochiState`: its address needs a permission granted in
 *   that browser, and turned on there it finds the logs it made by their markers (see kechimochi-runner.js).
 * - The keys of the old sync (`legacy-sync.js`).
 */
const PLAIN_KEYS = ["log", "videos", "goalMinutes", "range", "theme", "targetLanguage", "ratingPromptDone"];

/** The decisions about the language of videos: `overrides` (German) and `overrides:<code>`. */
const isOverridesKey = (key) => key === "overrides" || /^overrides:[a-z]{2,3}$/.test(key);

export const isBackupKey = (key) => PLAIN_KEYS.includes(key) || isOverridesKey(key);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The file name of a backup made on `date`: `inputly-backup-2026-11-25.json`, in local time. */
export function backupFileName(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `inputly-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** The backup of everything stored (`chrome.storage.local.get(null)`), as an object ready for JSON. */
export function buildBackup(stored, { version, now = new Date() }) {
  const data = {};
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (isBackupKey(key) && value !== undefined) {
      data[key] = value;
    }
  }
  return { app: APP_MARKER, exportedAt: now.toISOString(), version, storageVersion: STORAGE_VERSION, data };
}

/** The items of each day that make sense, within the limits `videos.js` keeps. */
function cleanVideos(videos) {
  if (!isObject(videos)) {
    return null;
  }
  const days = {};
  for (const [day, items] of Object.entries(videos)) {
    if (!DAY.test(day) || !isObject(items)) {
      continue;
    }
    const kept = {};
    for (const [id, item] of Object.entries(items)) {
      const clean = cleanVideo({ ...item, id });
      if (clean && Number.isFinite(item?.seconds) && item.seconds > 0) {
        // Stored as in videos.js: the id is the key, not a field
        delete clean.id;
        kept[id] = { ...clean, seconds: item.seconds };
      }
    }
    if (Object.keys(kept).length > 0) {
      days[day] = kept;
    }
  }
  return limitVideos(days);
}

/** At most `MAX_VIDEOS_PER_DAY` items a day (the longest) and the newest `MAX_VIDEO_DAYS` days. */
function limitVideos(videos) {
  const newest = Object.keys(videos).sort().slice(-MAX_VIDEO_DAYS);
  return Object.fromEntries(
    newest.map((day) => [
      day,
      Object.fromEntries(
        Object.entries(videos[day])
          .sort(([, a], [, b]) => b.seconds - a.seconds)
          .slice(0, MAX_VIDEOS_PER_DAY),
      ),
    ]),
  );
}

function cleanOverrides(overrides) {
  if (!isObject(overrides)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(overrides).filter(([id, value]) => isVideoId(id) && typeof value === "boolean"),
  );
}

/** Each kept key, cleaned; `undefined` for a value that makes no sense, which is then left out. */
function cleanValue(key, value) {
  if (isOverridesKey(key)) {
    return cleanOverrides(value) ?? undefined;
  }
  switch (key) {
    case "videos":
      return cleanVideos(value) ?? undefined;
    case "goalMinutes":
      return Number.isInteger(value) && value >= MIN_GOAL_MINUTES && value <= MAX_GOAL_MINUTES
        ? value
        : undefined;
    case "range":
      return RANGES.some(({ days }) => days === value) ? value : undefined;
    case "theme":
      return value === "light" || value === "dark" ? value : undefined;
    case "targetLanguage":
      return normalizeLanguage(value) === value ? value : undefined;
    case "ratingPromptDone":
      return value === true ? true : undefined;
    default:
      return undefined;
  }
}

/**
 * Reads the text of a backup file. `{ ok: true, data, summary }` with only clean values (the log already
 * migrated), or `{ ok: false, error }` with a sentence to show. Nothing from a file is written unchecked.
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not JSON." };
  }
  if (!isObject(parsed) || parsed.app !== APP_MARKER || !isObject(parsed.data)) {
    return { ok: false, error: "This file is not an Inputly backup." };
  }
  const { storageVersion } = parsed;
  if (!Number.isInteger(storageVersion) || storageVersion < 1) {
    return { ok: false, error: "This backup does not say which version made it." };
  }
  // A newer shape could hold data this version would drop or misread: update Inputly first
  if (storageVersion > STORAGE_VERSION) {
    return { ok: false, error: "This backup comes from a newer Inputly. Update Inputly, then import it." };
  }
  const raw = parsed.data;
  // A backup without a readable log would replace the history with nothing
  if (!isObject(raw.log) || !isObject(raw.log.days)) {
    return { ok: false, error: "This backup has no history in it." };
  }
  // Older shapes go through the same migration as the stored log does
  const data = { log: migrate(raw.log) };
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "log" && isBackupKey(key)) {
      const clean = cleanValue(key, value);
      if (clean !== undefined) {
        data[key] = clean;
      }
    }
  }
  return { ok: true, data, summary: summarize(data.log) };
}

/** What a log holds, to show before importing: days, first and last day, total seconds. */
export function summarize(log) {
  const shown = shownLog(log);
  const days = Object.keys(shown.days).sort();
  return {
    days: days.length,
    first: days[0] ?? null,
    last: days.at(-1) ?? null,
    seconds: totalSeconds(shown),
  };
}

/**
 * What to write to replace everything a backup carries. Backup keys missing from the file are removed,
 * so the result is the backup itself and not a mix with what was there.
 */
export function replacePlan(current, imported) {
  const remove = Object.keys(current ?? {}).filter((key) => isBackupKey(key) && !(key in imported));
  return { set: imported, remove };
}

/**
 * Joins a backup with what is stored, losing neither. Per day the larger counted time wins (the same day
 * counted twice in two browsers would be double if added); the items of a day are joined, the larger
 * seconds winning for the same item. The settings and the corrections already here are kept; the ones
 * of the backup only fill what is missing.
 */
export function mergeBackup(current, imported) {
  const here = migrate(current?.log);
  const there = imported.log;
  const days = { ...there.days };
  for (const [day, seconds] of Object.entries(here.days)) {
    days[day] = Math.max(seconds, days[day] ?? 0);
  }
  const adjust = { ...sanitizeAdjust(there.adjust), ...sanitizeAdjust(here.adjust) };
  const log =
    Object.keys(adjust).length > 0
      ? { version: STORAGE_VERSION, days, adjust }
      : { version: STORAGE_VERSION, days };

  const set = { log };
  const hereVideos = cleanVideos(current?.videos) ?? {};
  if (imported.videos || Object.keys(hereVideos).length > 0) {
    const joined = { ...imported.videos };
    for (const [day, items] of Object.entries(hereVideos)) {
      const merged = { ...joined[day] };
      for (const [id, item] of Object.entries(items)) {
        const other = merged[id];
        merged[id] = other && other.seconds > item.seconds ? other : item;
      }
      joined[day] = merged;
    }
    set.videos = limitVideos(joined);
  }
  for (const [key, value] of Object.entries(imported)) {
    if (key === "log" || key === "videos") {
      continue;
    }
    if (isOverridesKey(key)) {
      // The decisions made here win over the ones of the backup for the same video
      set[key] = { ...value, ...cleanOverrides(current?.[key]) };
    } else if (current?.[key] === undefined) {
      set[key] = value;
    }
  }
  return { set, remove: [] };
}
