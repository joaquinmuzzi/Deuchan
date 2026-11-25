/**
 * What Inputly's days look like in Kechimochi, and what to send so that Kechimochi shows them: no browser
 * here, so it is tested with plain objects. Used by "Send to Kechimochi" and by the CSV export alike.
 *
 * Kechimochi keeps media entries (identified by the exact pair of title and variant) and activity logs (a
 * media entry, a date, whole minutes, an activity type). Inputly keeps the seconds of each day (the log,
 * with the person's corrections) and the items of the newest days (`videos`, see videos.js). So each day
 * becomes one row per item, in whole minutes:
 *
 * - An item is a media entry with its title, and its site as the variant ("YouTube", "netflix.com"), so
 *   two shows of the same name on two sites stay apart. The activity is Watching, Listening for a tab that
 *   was only heard, and Reading for reading counted by hand.
 * - A day corrected down (the person said it was shorter) shrinks every item of it in proportion: which
 *   item was too long is not known, and the day must not show more in Kechimochi than in Inputly.
 * - What the items do not explain goes as one more row, "Other input" (variant "Inputly"): a day corrected
 *   up, the short items rounding lost, and the days older than the list of items (only their total is
 *   kept). So a day in Kechimochi adds up to the day in Inputly, to the minute.
 */
import { siteOf } from "./items.js";
import { shownLog } from "./log.js";
import { dayVideos } from "./videos.js";
import { isVideoId } from "./overrides.js";

/** The row of a day that is not one of its items (see above). */
export const REST_KEY = "rest";
export const REST_TITLE = "Other input";
export const REST_VARIANT = "Inputly";

/** The language as Kechimochi writes it, in English ("Japanese"), from a code ("ja"). */
export function languageName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(code) ?? code;
  } catch {
    return String(code);
  }
}

const ACTIVITY = { reading: "Reading", sound: "Listening", video: "Watching" };

/** Kechimochi's content types (its media library labels) for what each kind of item usually is. */
function contentType(id, kind) {
  if (kind === "sound") {
    return "Audio";
  }
  return isVideoId(id) && kind === "video" ? "Youtube Video" : "Unknown";
}

/**
 * The media entry of an item of `dayVideos`: title, variant, activity and content type. A title is never
 * blank, as Kechimochi refuses it.
 */
export function itemMedia({ id, title, url, kind }) {
  const youtube = isVideoId(id);
  const site = youtube ? "YouTube" : (siteOf(url) ?? "Web");
  const fallback = youtube ? `YouTube video ${id}` : url ? new URL(url).host + new URL(url).pathname : id;
  return {
    title: (title || fallback).trim().slice(0, 200),
    variant: site,
    activity: ACTIVITY[kind] ?? "Watching",
    contentType: contentType(id, kind),
  };
}

const minutesOf = (seconds) => Math.round(seconds / 60);

/**
 * The rows of one day: `{ key, title, variant, activity, contentType, minutes, url }`, `key` being the
 * item id (or `REST_KEY`). Rows of 0 minutes are left out: Kechimochi refuses a log with no time.
 *
 * @param {number} totalSeconds  the day as Inputly shows it for this computer, corrections included
 * @param {Array} items  `dayVideos` of the day (empty for a day older than the list of items)
 */
export function dayRows(totalSeconds, items) {
  const counted = items.reduce((sum, item) => sum + item.seconds, 0);
  const factor = counted > totalSeconds && counted > 0 ? totalSeconds / counted : 1;
  const rows = items.map((item) => ({
    key: item.id,
    ...itemMedia(item),
    minutes: minutesOf(item.seconds * factor),
    url: item.url ?? null,
  }));
  const rest = minutesOf(totalSeconds) - rows.reduce((sum, row) => sum + row.minutes, 0);
  if (rest > 0) {
    rows.push({
      key: REST_KEY,
      title: REST_TITLE,
      variant: REST_VARIANT,
      activity: "Watching",
      contentType: "Unknown",
      minutes: rest,
      url: null,
    });
  }
  return rows.filter((row) => row.minutes > 0);
}

/**
 * Every day of this computer as rows, the oldest first. `listed` says whether the day is within the list
 * of items (the newest days, see videos.js), even if it has none left (they were all taken out), or older
 * than it, with only its total.
 *
 * @param {object} log  the log as kept (`migrate`d), corrections included
 * @param {object} videos  as kept
 * @returns {{ day: string, listed: boolean, rows: object[] }[]}
 */
export function allDays(log, videos) {
  const totals = shownLog(log).days;
  const listedDays = Object.keys(videos ?? {}).sort();
  const oldest = listedDays[0];
  const days = [...new Set([...Object.keys(totals), ...listedDays])].sort();
  return days.map((day) => ({
    day,
    listed: oldest !== undefined && day >= oldest,
    rows: dayRows(totals[day] ?? 0, dayVideos(videos, day)),
  }));
}

/** The key of a media entry in Kechimochi: its exact title and variant (Kechimochi trims the variant). */
export const mediaKey = (title, variant) => `${title}\u0000${String(variant ?? "").trim()}`;

/**
 * The line that marks a log as Inputly's, in its notes: the item it is for (its date is the log's own).
 * If the answer to a new log is lost, the next sending finds the log by it instead of making a second one.
 */
export const logMarker = (key) => `[Inputly:${key}]`;

/** The item a log of Kechimochi is for, from its notes, or `null` if it is not Inputly's. */
export function markedKey(notes) {
  const match = /^\[Inputly:([\w:-]{1,64})\]$/m.exec(String(notes ?? ""));
  return match ? match[1] : null;
}

/**
 * What was sent, as kept in `kechimochiSent`: `{ "<day>": { "<key>": { log, minutes } } }`, `log` being
 * the id Kechimochi gave it (`null` when the person deleted it there: it is left deleted), or `true` for a
 * day that left the list of items after it was sent (see `planSync`). Anything that does not make sense
 * is dropped.
 */
export function readSent(saved) {
  const clean = {};
  for (const [day, entries] of Object.entries(saved && typeof saved === "object" ? saved : {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      continue;
    }
    if (entries === true) {
      clean[day] = true;
      continue;
    }
    const items = {};
    for (const [key, entry] of Object.entries(entries && typeof entries === "object" ? entries : {})) {
      const log =
        entry?.log === null || (Number.isInteger(entry?.log) && entry.log > 0) ? entry.log : undefined;
      if (log !== undefined && Number.isInteger(entry.minutes) && entry.minutes >= 0) {
        items[key] = { log, minutes: entry.minutes };
      }
    }
    if (Object.keys(items).length > 0) {
      clean[day] = items;
    }
  }
  return clean;
}

/**
 * What to send so that Kechimochi shows `days` (from `allDays`), given what was sent: never the same
 * minutes twice.
 *
 * - `create`: a row never sent (it may still be in Kechimochi, if the answer was lost: see `logMarker`)
 * - `update`: a row whose minutes changed (today as it grows, a day corrected): its log gets the new ones
 * - `remove`: a row sent before that is not there any more (the item was taken out of the day as not in
 *   the target language, or "Other input" became 0): its log is deleted
 * - `seal`: days that left the list of items (older than 60 days) after they were sent. Their rows can no
 *   longer be worked out, so they are left as they were sent, and kept only as `true`.
 *
 * A day with no items that was never sent goes once, as its total; it is sealed at once, so that a
 * correction of a day that old changes nothing in Kechimochi.
 */
export function planSync(days, sent) {
  const create = [];
  const update = [];
  const remove = [];
  const seal = [];
  for (const { day, listed, rows } of days) {
    const before = sent[day];
    if (before === true) {
      continue;
    }
    if (!listed && before) {
      seal.push(day);
      continue;
    }
    const wanted = new Set();
    for (const row of rows) {
      wanted.add(row.key);
      const done = before?.[row.key];
      if (!done) {
        create.push({ day, ...row, seal: !listed });
      } else if (done.log !== null && done.minutes !== row.minutes) {
        update.push({ day, ...row, log: done.log });
      }
    }
    for (const [key, done] of Object.entries(before ?? {})) {
      if (!wanted.has(key)) {
        remove.push({ day, key, log: done.log });
      }
    }
  }
  // A day sent before that has no time left at all (corrected to 0, its items taken out) is not in `days`
  const known = new Set(days.map(({ day }) => day));
  const oldestListed = days.find(({ listed }) => listed)?.day;
  for (const [day, before] of Object.entries(sent)) {
    if (known.has(day) || before === true) {
      continue;
    }
    if (oldestListed !== undefined && day >= oldestListed) {
      for (const [key, done] of Object.entries(before)) {
        remove.push({ day, key, log: done.log });
      }
    } else {
      seal.push(day);
    }
  }
  return { create, update, remove, seal };
}
