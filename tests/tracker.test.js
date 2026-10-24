import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_GAP_SECONDS, Tracker } from "../extension/src/tracker.js";

const seconds = (intervals) => intervals.reduce((sum, { from, to }) => sum + (to - from), 0);

test("counts the seconds a video plays, as one interval", () => {
  const tracker = new Tracker();
  tracker.play(100);
  tracker.tick(103);
  tracker.pause(104);
  assert.deepEqual(tracker.take(), [{ from: 100, to: 104 }]);
});

test("does not count while paused, and keeps the two pieces apart", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.pause(3);
  tracker.tick(60);
  tracker.play(100);
  tracker.pause(102);
  assert.deepEqual(tracker.take(), [
    { from: 0, to: 3 },
    { from: 100, to: 102 },
  ]);
});

test("take starts again from nothing", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.tick(2);
  assert.equal(seconds(tracker.take()), 2);
  assert.deepEqual(tracker.take(), []);
});

test("ticks while playing continue the same interval", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.tick(2);
  tracker.take();
  tracker.tick(4);
  assert.deepEqual(tracker.take(), [{ from: 2, to: 4 }]);
});

test("the speed does not matter: thirty seconds of the clock are thirty seconds", () => {
  // The tracker has no notion of speed: it only sees the clock, ticking every two seconds
  const tracker = new Tracker();
  tracker.play(0);
  for (let now = 2; now <= 30; now += 2) {
    tracker.tick(now);
  }
  assert.equal(seconds(tracker.take()), 30);
});

test("a long gap is not counted: the computer was asleep", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.tick(MAX_GAP_SECONDS + 1);
  assert.deepEqual(tracker.take(), []);
  tracker.tick(MAX_GAP_SECONDS + 3);
  assert.deepEqual(tracker.take(), [{ from: MAX_GAP_SECONDS + 1, to: MAX_GAP_SECONDS + 3 }]);
});

test("playing again while already playing does not lose or duplicate time", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.play(2);
  tracker.pause(3);
  assert.deepEqual(tracker.take(), [{ from: 0, to: 3 }]);
});

test("a clock that goes back counts nothing", () => {
  const tracker = new Tracker();
  tracker.play(10);
  tracker.tick(5);
  assert.deepEqual(tracker.take(), []);
});

test("ticks and pauses without playing do nothing", () => {
  const tracker = new Tracker();
  tracker.tick(10);
  tracker.pause(20);
  assert.equal(tracker.isPlaying, false);
  assert.deepEqual(tracker.take(), []);
});
