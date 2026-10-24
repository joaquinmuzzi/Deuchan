import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_GAP_SECONDS, Tracker } from "../extension/src/tracker.js";

test("counts the seconds a video plays", () => {
  const tracker = new Tracker();
  tracker.play(100);
  tracker.tick(103);
  tracker.pause(104);
  assert.equal(tracker.take(), 4);
});

test("does not count while paused", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.pause(3);
  tracker.tick(60);
  assert.equal(tracker.take(), 3);
});

test("take starts again from zero", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.tick(2);
  assert.equal(tracker.take(), 2);
  assert.equal(tracker.take(), 0);
});

test("a faster speed counts more media time", () => {
  const tracker = new Tracker();
  tracker.play(0, 1.5);
  tracker.pause(4);
  assert.equal(tracker.take(), 6);
});

test("a change of speed applies from that moment on", () => {
  const tracker = new Tracker();
  tracker.play(0, 1);
  tracker.setRate(2, 2);
  tracker.pause(4);
  assert.equal(tracker.take(), 2 + 4);
});

test("a long gap is not counted: the computer was asleep", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.tick(MAX_GAP_SECONDS + 1);
  assert.equal(tracker.take(), 0);
  tracker.tick(MAX_GAP_SECONDS + 3);
  assert.equal(tracker.take(), 2);
});

test("playing again while already playing does not lose or duplicate time", () => {
  const tracker = new Tracker();
  tracker.play(0);
  tracker.play(2);
  tracker.pause(3);
  assert.equal(tracker.take(), 3);
});

test("ticks and pauses without playing do nothing", () => {
  const tracker = new Tracker();
  tracker.tick(10);
  tracker.pause(20);
  assert.equal(tracker.isPlaying, false);
  assert.equal(tracker.take(), 0);
});
