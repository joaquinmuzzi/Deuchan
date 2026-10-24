import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STORAGE_VERSION,
  addSeconds,
  dayKey,
  emptyLog,
  formatDuration,
  lastDays,
  migrate,
  streak,
  totalOfLastDays,
  totalSeconds,
} from "../extension/src/log.js";

const TODAY = new Date(2026, 9, 24, 15, 30); // 24 October 2026

const logWith = (days) => ({ version: STORAGE_VERSION, days });

test("dayKey uses the local date with zero padding", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("addSeconds adds to a day without changing the given log", () => {
  const log = emptyLog();
  const once = addSeconds(log, "2026-10-24", 30);
  const twice = addSeconds(once, "2026-10-24", 15);
  assert.deepEqual(log.days, {});
  assert.equal(twice.days["2026-10-24"], 45);
});

test("addSeconds ignores nothing, negatives and NaN", () => {
  const log = emptyLog();
  assert.equal(addSeconds(log, "2026-10-24", 0), log);
  assert.equal(addSeconds(log, "2026-10-24", -5), log);
  assert.equal(addSeconds(log, "2026-10-24", NaN), log);
});

test("migrate turns unreadable data into an empty log", () => {
  for (const saved of [undefined, null, 5, "x", {}, { days: null }]) {
    assert.deepEqual(migrate(saved), emptyLog());
  }
});

test("migrate keeps valid days and drops the rest", () => {
  const saved = { version: 0, days: { "2026-10-24": 60, tomorrow: 10, "2026-10-23": -1, "2026-10-22": "5" } };
  assert.deepEqual(migrate(saved), logWith({ "2026-10-24": 60 }));
});

test("lastDays lists the days oldest first, ending today, with zeros for empty days", () => {
  const log = logWith({ "2026-10-24": 60, "2026-10-22": 30 });
  assert.deepEqual(lastDays(log, TODAY, 3), [
    { day: "2026-10-22", seconds: 30 },
    { day: "2026-10-23", seconds: 0 },
    { day: "2026-10-24", seconds: 60 },
  ]);
});

test("lastDays crosses month and year boundaries", () => {
  const days = lastDays(emptyLog(), new Date(2027, 0, 2, 9), 4).map((entry) => entry.day);
  assert.deepEqual(days, ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("totals add up the days of the window", () => {
  const log = logWith({ "2026-10-24": 60, "2026-10-20": 40, "2026-10-01": 500 });
  assert.equal(totalOfLastDays(log, TODAY, 7), 100);
  assert.equal(totalSeconds(log), 600);
});

test("streak counts the days in a row up to today", () => {
  const log = logWith({ "2026-10-24": 1, "2026-10-23": 1, "2026-10-22": 1, "2026-10-20": 1 });
  assert.equal(streak(log, TODAY), 3);
});

test("an empty today does not break the streak", () => {
  const log = logWith({ "2026-10-23": 1, "2026-10-22": 1 });
  assert.equal(streak(log, TODAY), 2);
});

test("no German yesterday or today means no streak", () => {
  assert.equal(streak(logWith({ "2026-10-20": 100 }), TODAY), 0);
  assert.equal(streak(emptyLog(), TODAY), 0);
});

test("formatDuration", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(20), "< 1 min");
  assert.equal(formatDuration(1500), "25 min");
  assert.equal(formatDuration(5400), "1 h 30 min");
  assert.equal(formatDuration(7200), "2 h 00 min");
});
