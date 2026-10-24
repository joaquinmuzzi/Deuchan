import assert from "node:assert/strict";
import { test } from "node:test";

import { Watcher } from "../extension/src/watcher.js";

function setup() {
  const sent = [];
  return { sent, watcher: new Watcher({ send: (seconds) => sent.push(seconds) }) };
}

test("saves the time of a German video when it pauses", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0, 1);
  watcher.pause(4);
  assert.deepEqual(sent, [4]);
});

test("does not save the time of a video that is not German", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, false);
  watcher.play(0, 1);
  watcher.pause(4);
  assert.deepEqual(sent, []);
});

test("keeps the time until the language is known, then credits it", () => {
  const { sent, watcher } = setup();
  watcher.play(0, 1);
  watcher.flush(3);
  assert.deepEqual(sent, []);
  watcher.setGerman(4, true);
  assert.deepEqual(sent, [4]);
});

test("drops the time kept for a video that turns out not to be German", () => {
  const { sent, watcher } = setup();
  watcher.play(0, 1);
  watcher.flush(3);
  watcher.setGerman(4, false);
  watcher.pause(8);
  assert.deepEqual(sent, []);
});

test("flush saves in pieces while the video keeps playing", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0, 1);
  watcher.flush(3);
  watcher.flush(5);
  assert.deepEqual(sent, [3, 2]);
});

test("a new video settles the old one and starts without a verdict", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0, 1);
  watcher.newVideo(3);
  watcher.flush(5);
  assert.deepEqual(sent, [3]);
  watcher.setGerman(5, false);
  watcher.flush(6);
  assert.deepEqual(sent, [3]);
});

test("time kept without a verdict is not carried over to the next video", () => {
  const { sent, watcher } = setup();
  watcher.play(0, 1);
  watcher.newVideo(3);
  watcher.setGerman(3, true);
  watcher.pause(5);
  assert.deepEqual(sent, [2]);
});

test("the speed multiplies the time", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0, 2);
  watcher.pause(3);
  assert.deepEqual(sent, [6]);
});
