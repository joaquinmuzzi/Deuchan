import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyLog } from "../extension/src/log.js";
import { summarize } from "../extension/src/summary.js";

const TODAY = new Date(2026, 9, 24, 12);

test("an empty log shows zeros and the default goal", () => {
  const summary = summarize(emptyLog(), TODAY);
  assert.equal(summary.today, "0:00");
  assert.equal(summary.goal, "30:00");
  assert.equal(summary.goalMet, false);
  assert.equal(summary.streak, 0);
});

test("sums today, the week and the month", () => {
  const log = {
    version: 1,
    days: { "2026-10-24": 1800, "2026-10-20": 3600, "2026-10-01": 600, "2026-08-01": 60 },
  };
  const summary = summarize(log, TODAY);
  assert.equal(summary.today, "30:00");
  assert.equal(summary.week, "1:30:00");
  assert.equal(summary.month, "1:40:00");
});

test("the goal is the one given, and is met when today reaches it", () => {
  const log = { version: 1, days: { "2026-10-24": 1200 } };
  assert.equal(summarize(log, TODAY, 20).goal, "20:00");
  assert.equal(summarize(log, TODAY, 20).goalMet, true);
  assert.equal(summarize(log, TODAY, 21).goalMet, false);
});
