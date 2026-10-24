import assert from "node:assert/strict";
import { test } from "node:test";

import { Watcher } from "../extension/src/watcher.js";

function setup() {
  const sent = [];
  return { sent, watcher: new Watcher({ send: (intervals) => sent.push(intervals) }) };
}

test("saves the time of a German video when it pauses", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0);
  watcher.pause(4);
  assert.deepEqual(sent, [[{ from: 0, to: 4 }]]);
});

test("does not save the time of a video that is not German", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, false);
  watcher.play(0);
  watcher.pause(4);
  assert.deepEqual(sent, []);
});

test("keeps the time until the language is known, then credits it", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.flush(3);
  assert.deepEqual(sent, []);
  watcher.setGerman(4, true);
  assert.deepEqual(sent, [[{ from: 0, to: 4 }]]);
});

test("drops the time kept for a video that turns out not to be German", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.flush(3);
  watcher.setGerman(4, false);
  watcher.pause(8);
  assert.deepEqual(sent, []);
});

test("flush saves in pieces while the video keeps playing", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0);
  watcher.flush(3);
  watcher.flush(5);
  assert.deepEqual(sent, [[{ from: 0, to: 3 }], [{ from: 3, to: 5 }]]);
});

test("a new video settles the old one and starts without a verdict", () => {
  const { sent, watcher } = setup();
  watcher.setGerman(0, true);
  watcher.play(0);
  watcher.newVideo(3);
  watcher.flush(5);
  assert.deepEqual(sent, [[{ from: 0, to: 3 }]]);
  watcher.setGerman(5, false);
  watcher.flush(6);
  assert.equal(sent.length, 1);
});

test("time kept without a verdict is not carried over to the next video", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.newVideo(3);
  watcher.setGerman(3, true);
  watcher.pause(5);
  assert.deepEqual(sent, [[{ from: 3, to: 5 }]]);
});

test("the watcher reports what the status needs", () => {
  const watcher = new Watcher({ send: () => {} });
  assert.deepEqual(watcher.status, { german: null, playing: false });
  watcher.play(0);
  watcher.setGerman(1, true);
  assert.deepEqual(watcher.status, { german: true, playing: true });
  watcher.pause(2);
  assert.deepEqual(watcher.status, { german: true, playing: false });
  watcher.newVideo(3);
  assert.equal(watcher.status.german, null);
});
