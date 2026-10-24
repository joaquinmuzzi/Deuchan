import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_GOAL_MINUTES,
  MAX_GOAL_MINUTES,
  MIN_GOAL_MINUTES,
  goalMinutesOf,
  goalSeconds,
  parseGoalMinutes,
} from "../extension/src/goal.js";

test("the default goal is 30 minutes", () => {
  assert.equal(DEFAULT_GOAL_MINUTES, 30);
});

test("parseGoalMinutes accepts whole numbers in range, with spaces around", () => {
  assert.equal(parseGoalMinutes("45"), 45);
  assert.equal(parseGoalMinutes("  20 "), 20);
  assert.equal(parseGoalMinutes(String(MIN_GOAL_MINUTES)), MIN_GOAL_MINUTES);
  assert.equal(parseGoalMinutes(String(MAX_GOAL_MINUTES)), MAX_GOAL_MINUTES);
});

test("parseGoalMinutes rejects anything else", () => {
  for (const text of ["", " ", "0", "601", "-5", "1.5", "1,5", "abc", "30 min", "1e2", undefined, null]) {
    assert.equal(parseGoalMinutes(text), null, String(text));
  }
});

test("goalMinutesOf keeps a saved goal and falls back to the default", () => {
  assert.equal(goalMinutesOf(45), 45);
  for (const saved of [undefined, null, "45", 0, 601, 1.5, NaN]) {
    assert.equal(goalMinutesOf(saved), DEFAULT_GOAL_MINUTES, String(saved));
  }
});

test("goalSeconds converts minutes", () => {
  assert.equal(goalSeconds(30), 1800);
});
