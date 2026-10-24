import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyLog } from "../extension/src/log.js";
import { summarize } from "../extension/src/summary.js";

const TODAY = new Date(2026, 9, 24, 12);

test("an empty log shows zeros and flat bars", () => {
  const summary = summarize(emptyLog(), TODAY);
  assert.equal(summary.today, "0 min");
  assert.equal(summary.total, "0 min");
  assert.equal(summary.streak, 0);
  assert.equal(summary.bars.length, 7);
  assert.ok(summary.bars.every((bar) => bar.height === 0));
});

test("sums today, the week, the month and everything", () => {
  const log = {
    version: 1,
    days: { "2026-10-24": 1800, "2026-10-20": 3600, "2026-10-01": 600, "2026-08-01": 60 },
  };
  const summary = summarize(log, TODAY);
  assert.equal(summary.today, "30 min");
  assert.equal(summary.week, "1 h 30 min");
  assert.equal(summary.month, "1 h 40 min");
  assert.equal(summary.total, "1 h 41 min");
});

test("the tallest day of the week fills its bar and the others are in proportion", () => {
  const log = { version: 1, days: { "2026-10-24": 1800, "2026-10-23": 900 } };
  const bars = summarize(log, TODAY).bars;
  assert.equal(bars[6].day, "2026-10-24");
  assert.equal(bars[6].height, 1);
  assert.equal(bars[5].height, 0.5);
  assert.equal(bars[0].height, 0);
});
