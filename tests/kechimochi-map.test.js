import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REST_KEY,
  allDays,
  dayRows,
  itemMedia,
  languageName,
  logMarker,
  markedKey,
  mediaKey,
  planSync,
  readSent,
} from "../extension/src/kechimochi-map.js";

const YT = "dQw4w9WgXcQ";
const item = (id, seconds, extra = {}) => ({
  id,
  title: `Title ${id}`,
  seconds,
  url: null,
  kind: "video",
  ...extra,
});

test("the language goes by its English name", () => {
  assert.equal(languageName("ja"), "Japanese");
  assert.equal(languageName("de"), "German");
  assert.equal(languageName("zh"), "Chinese");
});

test("an item is a media entry with its site as the variant and an activity for its kind", () => {
  assert.deepEqual(itemMedia(item(YT, 60)), {
    title: `Title ${YT}`,
    variant: "YouTube",
    activity: "Watching",
    contentType: "Youtube Video",
  });
  assert.deepEqual(
    itemMedia({ id: "web:a1", title: "Frieren 3", url: "https://www.netflix.com/watch/1", kind: "video" }),
    { title: "Frieren 3", variant: "netflix.com", activity: "Watching", contentType: "Unknown" },
  );
  const sound = itemMedia({ id: "web:a1", title: "Pod", url: "https://pod.example/1", kind: "sound" });
  assert.equal(sound.activity, "Listening");
  assert.equal(sound.contentType, "Audio");
  const reading = itemMedia({ id: "web:a1", title: "Manga", url: "https://m.example/1", kind: "reading" });
  assert.equal(reading.activity, "Reading");
  // A title is never blank
  assert.equal(itemMedia({ id: YT, title: "", kind: "video" }).title, `YouTube video ${YT}`);
  assert.equal(
    itemMedia({ id: "web:a1", title: "", url: "https://m.example/read/2?p=1", kind: "reading" }).title,
    "m.example/read/2",
  );
  assert.equal(itemMedia({ id: "web:a1", title: "", url: null, kind: "video" }).variant, "Web");
});

test("a day adds up to its total: items in whole minutes, and the rest as Other input", () => {
  const rows = dayRows(1800, [item(YT, 1000), item("web:b", 500, { url: "https://twitch.tv/x" })]);
  assert.deepEqual(
    rows.map((row) => [row.key, row.minutes, row.variant]),
    [
      [YT, 17, "YouTube"],
      ["web:b", 8, "twitch.tv"],
      [REST_KEY, 5, "Inputly"],
    ],
  );
  // Short items round to nothing, and the rest keeps them
  const short = dayRows(100, [item(YT, 25), item("web:b", 25), item("web:c", 25), item("web:d", 25)]);
  assert.deepEqual(
    short.map((row) => [row.key, row.minutes]),
    [[REST_KEY, 2]],
  );
});

test("a day corrected down shrinks every item in proportion, and nothing is left over", () => {
  const rows = dayRows(1200, [item(YT, 1800), item("web:b", 600)]);
  assert.deepEqual(
    rows.map((row) => [row.key, row.minutes]),
    [
      [YT, 15],
      ["web:b", 5],
    ],
  );
  assert.deepEqual(dayRows(0, [item(YT, 600)]), []);
});

test("every day of the log is there, with its items while it is in the list", () => {
  const log = {
    version: 1,
    days: { "2026-01-01": 3600, "2026-11-24": 600, "2026-11-25": 300 },
    adjust: { "2026-11-24": { seconds: 300, at: 1 } },
  };
  const videos = { "2026-11-24": { [YT]: { title: "A", seconds: 600 } }, "2026-11-25": {} };
  const days = allDays(log, videos);
  assert.deepEqual(
    days.map(({ day, listed, rows }) => [day, listed, rows.map((row) => `${row.key}:${row.minutes}`)]),
    [
      ["2026-01-01", false, ["rest:60"]],
      ["2026-11-24", true, [`${YT}:10`, "rest:5"]],
      ["2026-11-25", true, ["rest:5"]],
    ],
  );
  assert.deepEqual(allDays(undefined, undefined), []);
});

test("the marker of a log names its item, and only Inputly's is found", () => {
  assert.equal(markedKey(logMarker(YT)), YT);
  assert.equal(markedKey(`My own note\n${logMarker("web:abc")}`), "web:abc");
  assert.equal(markedKey(logMarker(REST_KEY)), REST_KEY);
  assert.equal(markedKey("[GSM sync:abc:def]"), null);
  assert.equal(markedKey(""), null);
  assert.equal(markedKey(undefined), null);
  assert.notEqual(mediaKey("A", "YouTube"), mediaKey("A", "netflix.com"));
  assert.equal(mediaKey("A", " YouTube "), mediaKey("A", "YouTube"));
});

test("what was sent is read back only when it makes sense", () => {
  assert.deepEqual(
    readSent({
      "2026-11-25": {
        [YT]: { log: 3, minutes: 10 },
        bad: { log: "x", minutes: 1 },
        gone: { log: null, minutes: 2 },
      },
      "2026-01-01": true,
      nope: { [YT]: { log: 1, minutes: 1 } },
      "2026-11-24": { [YT]: { log: 0, minutes: 1 } },
    }),
    {
      "2026-11-25": { [YT]: { log: 3, minutes: 10 }, gone: { log: null, minutes: 2 } },
      "2026-01-01": true,
    },
  );
  assert.deepEqual(readSent(null), {});
  assert.deepEqual(readSent("x"), {});
});

const row = (key, minutes) => ({
  key,
  title: key,
  variant: "YouTube",
  activity: "Watching",
  contentType: "Unknown",
  minutes,
  url: null,
});

test("the same minutes are never sent twice: new rows are made, grown ones updated", () => {
  const days = [{ day: "2026-11-25", listed: true, rows: [row(YT, 12), row("web:b", 5)] }];
  const first = planSync(days, {});
  assert.deepEqual(
    first.create.map((each) => each.key),
    [YT, "web:b"],
  );
  assert.deepEqual([first.update, first.remove, first.seal], [[], [], []]);

  const sent = { "2026-11-25": { [YT]: { log: 1, minutes: 10 }, "web:b": { log: 2, minutes: 5 } } };
  const second = planSync(days, sent);
  assert.deepEqual(second.create, []);
  assert.deepEqual(
    second.update.map((each) => [each.key, each.log, each.minutes]),
    [[YT, 1, 12]],
  );

  const done = { "2026-11-25": { [YT]: { log: 1, minutes: 12 }, "web:b": { log: 2, minutes: 5 } } };
  assert.deepEqual(planSync(days, done), { create: [], update: [], remove: [], seal: [] });
});

test("a row gone from a day is removed, and a log deleted in Kechimochi is left deleted", () => {
  const days = [{ day: "2026-11-25", listed: true, rows: [row(YT, 12)] }];
  const sent = { "2026-11-25": { [YT]: { log: null, minutes: 10 }, "web:b": { log: 2, minutes: 5 } } };
  const plan = planSync(days, sent);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.remove, [{ day: "2026-11-25", key: "web:b", log: 2 }]);
  // A day with no time left at all, within the list
  const empty = planSync([{ day: "2026-11-24", listed: true, rows: [] }], {
    "2026-11-25": { [YT]: { log: 4, minutes: 3 } },
  });
  assert.deepEqual(empty.remove, [{ day: "2026-11-25", key: YT, log: 4 }]);
});

test("days that left the list after they were sent are sealed, and old days go once as a total", () => {
  const days = [
    { day: "2026-01-01", listed: false, rows: [row(REST_KEY, 60)] },
    { day: "2026-01-02", listed: false, rows: [row(REST_KEY, 30)] },
    { day: "2026-01-03", listed: false, rows: [row(REST_KEY, 30)] },
    { day: "2026-11-25", listed: true, rows: [] },
  ];
  const plan = planSync(days, { "2026-01-02": { [YT]: { log: 1, minutes: 25 } }, "2026-01-03": true });
  assert.deepEqual(
    plan.create.map((each) => [each.day, each.minutes, each.seal]),
    [["2026-01-01", 60, true]],
  );
  assert.deepEqual(plan.seal, ["2026-01-02"]);
  assert.deepEqual(plan.remove, []);
  // Not in the days at all and older than the list: sealed too
  assert.deepEqual(planSync(days, { "2025-12-31": { [YT]: { log: 9, minutes: 5 } } }).seal, ["2025-12-31"]);
});
