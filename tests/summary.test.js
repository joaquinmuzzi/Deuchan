import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyLog } from "../extension/src/log.js";
import { summarize } from "../extension/src/summary.js";

const TODAY = new Date(2026, 9, 24, 12);

const logWith = (days) => ({ version: 1, days });

test("an empty log shows zeros, the default goal and no progress", () => {
  const summary = summarize(emptyLog(), TODAY);
  assert.equal(summary.today, "0:00");
  assert.equal(summary.goal, "30:00");
  assert.equal(summary.goalMet, false);
  assert.equal(summary.goalText, "30:00 left of 30:00");
  assert.equal(summary.progress, 0);
  assert.equal(summary.streak, "0 days");
  assert.equal(summary.dailyAverage, "0:00");
});

test("the goal says what is left and the bar shows how far it is", () => {
  const summary = summarize(logWith({ "2026-10-24": 1082 }), TODAY); // 18:02 of 30:00
  assert.equal(summary.today, "18:02");
  assert.equal(summary.goalText, "11:58 left of 30:00");
  assert.equal(summary.goalMet, false);
  assert.ok(Math.abs(summary.progress - 1082 / 1800) < 1e-9);
});

test("the goal is the one given, and is met exactly when today reaches it", () => {
  const log = logWith({ "2026-10-24": 1200 });
  assert.equal(summarize(log, TODAY, 20).goal, "20:00");
  assert.equal(summarize(log, TODAY, 20).goalMet, true);
  assert.equal(summarize(log, TODAY, 21).goalMet, false);
});

test("a reached goal says so, and the bar stops at the end however far past it is", () => {
  const summary = summarize(logWith({ "2026-10-24": 2700 }), TODAY); // 45:00 of 30:00
  assert.equal(summary.goalMet, true);
  assert.equal(summary.goalText, "Goal reached · 30:00");
  assert.equal(summary.progress, 1);
  assert.equal(summary.today, "45:00");
});

test("the streak has its unit, singular for one day", () => {
  assert.equal(summarize(logWith({ "2026-10-24": 5 }), TODAY).streak, "1 day");
  assert.equal(
    summarize(logWith({ "2026-10-24": 5, "2026-10-23": 5, "2026-10-22": 5 }), TODAY).streak,
    "3 days",
  );
});

test("the daily average counts the days since the first, and the week adds up its seven days", () => {
  const log = logWith({ "2026-10-24": 1800, "2026-10-20": 3600, "2026-10-01": 600, "2026-08-01": 60 });
  const summary = summarize(log, TODAY);
  assert.equal(summary.week, "1:30:00");
  // 6060 s over the 85 days from 1 August to 24 October
  assert.equal(summary.dailyAverage, "1:11");
});
