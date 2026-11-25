/**
 * The history as a CSV file in Kechimochi's "Activity Logs" format (see its `docs/csv-formats.md`), which
 * Kechimochi imports as it is and any spreadsheet opens: one row per day and item, in whole minutes, with
 * the same rows "Send to Kechimochi" sends (see kechimochi-map.js).
 *
 * Kechimochi wants UTF-8 with its own headers and no other column: an unknown one makes the whole import
 * fail. So there is no byte order mark either, which Kechimochi would read as part of the first header.
 */
import { REST_KEY, allDays, mediaKey } from "./kechimochi-map.js";

export const CSV_HEADERS = Object.freeze([
  "Date",
  "Log Name",
  "Default Activity Type",
  "Duration",
  "Language",
  "Characters",
  "Activity Type",
  "Notes",
  "Media Variant",
]);

/** A field as CSV writes it: in quotes when it has a comma, a quote, a line break or spaces at its ends. */
export function csvField(value) {
  const text = String(value ?? "");
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const REST_NOTES = {
  listed: "Corrections and short items counted by Inputly",
  total: "Day total counted by Inputly; its list of items is no longer kept",
};

/**
 * The CSV text of the whole history of this computer.
 *
 * Kechimochi refuses an import in which two rows that make the same new media entry give it different
 * default activity types, so each media entry gets one: the activity of most of its minutes (a page both
 * watched and heard). The activity of each row stays its own, in "Activity Type".
 *
 * @param {object} log  the log as kept (`migrate`d)
 * @param {object} videos  as kept
 * @param {string} language  the name of the language in English ("Japanese")
 */
export function activityCsv(log, videos, language) {
  const rows = allDays(log, videos).flatMap(({ day, listed, rows: dayRows }) =>
    dayRows.map((row) => ({ day, listed, ...row })),
  );
  const minutesBy = new Map();
  for (const row of rows) {
    const key = mediaKey(row.title, row.variant);
    const activities = minutesBy.get(key) ?? {};
    activities[row.activity] = (activities[row.activity] ?? 0) + row.minutes;
    minutesBy.set(key, activities);
  }
  const defaults = new Map(
    [...minutesBy].map(([key, activities]) => [
      key,
      Object.entries(activities).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0][0],
    ]),
  );
  const lines = rows.map((row) =>
    [
      row.day,
      row.title,
      defaults.get(mediaKey(row.title, row.variant)),
      row.minutes,
      language,
      0,
      row.activity,
      row.key === REST_KEY ? REST_NOTES[row.listed ? "listed" : "total"] : (row.url ?? ""),
      row.variant,
    ]
      .map(csvField)
      .join(","),
  );
  return [CSV_HEADERS.join(","), ...lines].join("\r\n") + "\r\n";
}

/** The name of the file, with the day it was made: `inputly-activity-2026-11-25.csv`. */
export const csvFileName = (day) => `inputly-activity-${day}.csv`;
