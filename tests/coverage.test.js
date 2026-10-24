import assert from "node:assert/strict";
import { test } from "node:test";

import { KEEP_SECONDS, addCoverage, isValidInterval } from "../extension/src/coverage.js";

/** Adds the intervals one after the other and returns the seconds credited each time. */
function credit(...intervals) {
  let covered = [];
  const credited = [];
  for (const [from, to] of intervals) {
    const result = addCoverage(covered, { from, to });
    covered = result.covered;
    credited.push(result.newSeconds);
  }
  return { credited, covered };
}

test("an interval with nothing before it counts in full", () => {
  assert.deepEqual(credit([0, 10]).credited, [10]);
});

test("two tabs playing at the same time count once", () => {
  assert.deepEqual(credit([0, 60], [0, 60]).credited, [60, 0]);
});

test("two tabs that overlap partly count the union", () => {
  assert.deepEqual(credit([0, 10], [6, 16]).credited, [10, 6]);
});

test("two tabs reporting by turns, two seconds at a time, count the real time", () => {
  const { credited } = credit([0, 2], [1, 3], [2, 4], [3, 5]);
  assert.equal(
    credited.reduce((a, b) => a + b, 0),
    5,
  );
});

test("one video after another counts both", () => {
  assert.deepEqual(credit([0, 3600], [3600, 7200]).credited, [3600, 3600]);
});

test("a late report that fills a gap is counted", () => {
  // The first tab played 0-2 and 8-10; the second one, reporting late, played 3-7
  assert.deepEqual(credit([0, 2], [8, 10], [3, 7]).credited, [2, 2, 4]);
});

test("an interval inside a bigger covered one counts nothing", () => {
  assert.deepEqual(credit([0, 100], [40, 50]).credited, [100, 0]);
});

test("touching intervals are merged into one", () => {
  assert.deepEqual(credit([0, 5], [5, 10]).covered, [{ from: 0, to: 10 }]);
});

test("old intervals are forgotten", () => {
  const { covered } = credit([0, 10], [KEEP_SECONDS + 100, KEEP_SECONDS + 110]);
  assert.deepEqual(covered, [{ from: KEEP_SECONDS + 100, to: KEEP_SECONDS + 110 }]);
});

test("isValidInterval accepts what a tab could have measured", () => {
  assert.equal(isValidInterval({ from: 100, to: 110 }, 120), true);
});

test("isValidInterval rejects nonsense", () => {
  for (const interval of [
    undefined,
    null,
    {},
    { from: 10, to: 10 },
    { from: 10, to: 5 },
    { from: "1", to: 5 },
    { from: NaN, to: 5 },
    { from: 0, to: 100_000 },
    { from: 1000, to: 1010 }, // ends in the future
  ]) {
    assert.equal(isValidInterval(interval, 120), false, JSON.stringify(interval));
  }
});
