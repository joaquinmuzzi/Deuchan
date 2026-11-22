/**
 * The log of watched time: how many seconds of German were watched on each day.
 *
 * Everything here is a pure function on plain objects, so it can be tested without a browser. The
 * shape is `{ version, days: { "2026-10-24": 3600 }, adjust? }`: only what was counted on this computer
 * (this Chrome profile), and the corrections of its days (see `corrections.js`). What the other
 * computers counted comes from Mosaik (see `mosaik-days.js`).
 */

/** Bump it when the shape changes, and migrate the old data in `migrate`. */
export const STORAGE_VERSION = 1;

export const emptyLog = () => ({ version: STORAGE_VERSION, days: {} });

/** The hour a day starts at, as in Anki and Mosaik: what is watched at 01:00 belongs to the evening before. */
export const DAY_START_HOUR = 4;

/** The day `count` days before the one of `date`, at noon so that daylight saving changes cannot skip a day. */
export function daysBefore(date, count) {
  const back = count + (date.getHours() < DAY_START_HOUR ? 1 : 0);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back, 12);
}

/** The key of the day of a moment in the user's own time zone, as `YYYY-MM-DD`. */
export function dayKey(date) {
  const start = daysBefore(date, 0);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${start.getFullYear()}-${month}-${day}`;
}

/** Brings data saved by an older version up to date, and anything unreadable to an empty log. */
export function migrate(saved) {
  if (!saved || typeof saved !== "object" || typeof saved.days !== "object" || saved.days === null) {
    return emptyLog();
  }
  const days = {};
  for (const [key, seconds] of Object.entries(saved.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(seconds) && seconds > 0) {
      days[key] = seconds;
    }
  }
  // The corrections of this device are kept as they are, if they make sense
  const adjust = sanitizeAdjust(saved.adjust);
  return Object.keys(adjust).length > 0
    ? { version: STORAGE_VERSION, days, adjust }
    : { version: STORAGE_VERSION, days };
}

/** A new log with `seconds` added to a day; the given log is not changed. */
export function addSeconds(log, key, seconds) {
  if (!(seconds > 0)) {
    return log;
  }
  return { ...log, days: { ...log.days, [key]: (log.days[key] ?? 0) + seconds } };
}

/** The seconds of each of the last `count` days, the oldest first, ending today. */
export function lastDays(log, today, count) {
  return Array.from({ length: count }, (_, index) => {
    const key = dayKey(daysBefore(today, count - 1 - index));
    return { day: key, seconds: log.days[key] ?? 0 };
  });
}

/** Total seconds of the last `count` days, today included. */
export function totalOfLastDays(log, today, count) {
  return lastDays(log, today, count).reduce((sum, { seconds }) => sum + seconds, 0);
}

export function totalSeconds(log) {
  return Object.values(log.days).reduce((sum, seconds) => sum + seconds, 0);
}

/**
 * Days in a row with German, counting back from today. A day that has not started yet does not
 * break the streak: if today is still empty, it counts from yesterday.
 */
export function streak(log, today) {
  let count = 0;
  let offset = (log.days[dayKey(today)] ?? 0) > 0 ? 0 : 1;
  while ((log.days[dayKey(daysBefore(today, offset))] ?? 0) > 0) {
    count += 1;
    offset += 1;
  }
  return count;
}

/** `5430` as `1:30:30`, `1500` as `25:00` and `20` as `0:20`: hours only when there are some. */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A correction cannot add or take away more than this from a day. */
const MAX_ADJUST_SECONDS = 7 * 24 * 3600;

/**
 * The corrections that make sense: `{ "2026-10-24": { seconds: -900, at: 1761300000000 } }`, a date,
 * the seconds added to what was counted (negative to take time away) and when it was made, in ms.
 */
export function sanitizeAdjust(adjust) {
  if (!adjust || typeof adjust !== "object") {
    return {};
  }
  const clean = {};
  for (const [key, entry] of Object.entries(adjust)) {
    const { seconds, at } = entry ?? {};
    if (DAY.test(key) && Number.isFinite(seconds) && Number.isFinite(at) && at > 0) {
      clean[key] = {
        seconds: Math.max(-MAX_ADJUST_SECONDS, Math.min(MAX_ADJUST_SECONDS, seconds)),
        at,
      };
    }
  }
  return clean;
}

/**
 * The log to show for this computer: what it counted with its corrections. A corrected day cannot go
 * below zero, and a day with no time is not in it.
 */
export function shownLog(log) {
  const days = { ...log?.days };
  for (const [key, { seconds }] of Object.entries(sanitizeAdjust(log?.adjust))) {
    days[key] = (days[key] ?? 0) + seconds;
  }
  for (const [key, seconds] of Object.entries(days)) {
    if (!(seconds > 0)) {
      delete days[key];
    }
  }
  const shown = { ...log, days };
  delete shown.adjust;
  return shown;
}
