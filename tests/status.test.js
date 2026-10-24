import assert from "node:assert/strict";
import { test } from "node:test";

import { describeStatus } from "../extension/src/status.js";
import { Watcher } from "../extension/src/watcher.js";

test("no reply means the tab is not YouTube", () => {
  assert.deepEqual(describeStatus(undefined), { kind: "idle", text: "Not on YouTube" });
});

test("an unknown language is being detected", () => {
  assert.equal(describeStatus({ german: null, playing: true }).text, "Detecting the language…");
});

test("a video that is not German is not counted, playing or not", () => {
  for (const playing of [true, false]) {
    assert.deepEqual(describeStatus({ german: false, playing }), {
      kind: "off",
      text: "Not German, not counted",
    });
  }
});

test("a German video counts only while it plays", () => {
  assert.equal(describeStatus({ german: true, playing: true }).kind, "counting");
  assert.equal(describeStatus({ german: true, playing: false }).text, "German video, paused");
});

test("the watcher reports what the status needs", () => {
  const watcher = new Watcher({ send: () => {} });
  assert.deepEqual(watcher.status, { german: null, playing: false });
  watcher.play(0, 1);
  watcher.setGerman(1, true);
  assert.deepEqual(watcher.status, { german: true, playing: true });
  watcher.pause(2);
  assert.deepEqual(watcher.status, { german: true, playing: false });
  watcher.newVideo(3);
  assert.equal(watcher.status.german, null);
});
