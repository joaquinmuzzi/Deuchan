import assert from "node:assert/strict";
import { test } from "node:test";

import { describeStatus } from "../extension/src/status.js";
import { Watcher } from "../extension/src/watcher.js";

test("no reply means the tab is not YouTube, and there is nothing to override", () => {
  assert.deepEqual(describeStatus(undefined), { kind: "idle", text: "Not on YouTube" });
});

test("an unknown language is being detected, with no button yet", () => {
  const status = describeStatus({ german: null, playing: true });
  assert.equal(status.text, "Detecting the language…");
  assert.equal(status.action, undefined);
});

test("a video that is not German can be marked as German, playing or not", () => {
  for (const playing of [true, false]) {
    assert.deepEqual(describeStatus({ german: false, playing }), {
      kind: "off",
      text: "Not German, not counted",
      hint: "Use the button below to override",
      action: { german: true, label: "Mark as German" },
    });
  }
});

test("a German video counts only while it plays, and can be marked as not German", () => {
  const playing = describeStatus({ german: true, playing: true });
  assert.equal(playing.kind, "counting");
  assert.deepEqual(playing.action, { german: false, label: "Mark as not German" });

  const paused = describeStatus({ german: true, playing: false });
  assert.equal(paused.text, "German video, paused");
  assert.deepEqual(paused.action, { german: false, label: "Mark as not German" });
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

test("marking a video as not German stops what is counted, and marking it back resumes it", () => {
  const sent = [];
  const watcher = new Watcher({ send: (intervals) => sent.push(intervals) });
  watcher.setGerman(0, true);
  watcher.play(0);
  watcher.flush(2);
  watcher.setGerman(3, false); // the user marks the video as not German: the last second goes too
  watcher.flush(5);
  assert.deepEqual(sent, [[{ from: 0, to: 2 }]]);
  watcher.setGerman(6, true); // and changes their mind
  watcher.pause(8);
  assert.deepEqual(sent.at(-1), [{ from: 6, to: 8 }]);
});
