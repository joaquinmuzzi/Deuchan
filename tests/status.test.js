import assert from "node:assert/strict";
import { test } from "node:test";

import { describeStatus } from "../extension/src/status.js";
import { Watcher } from "../extension/src/watcher.js";

test("no reply means there is no video in the tab, and there is nothing to override", () => {
  assert.deepEqual(describeStatus(undefined), { kind: "idle", text: "No video here" });
  assert.deepEqual(describeStatus(undefined, "counting"), {
    kind: "counting",
    text: "Counting sound (immersion profile)",
  });
  assert.deepEqual(describeStatus(undefined, "waiting"), {
    kind: "idle",
    text: "Sound, counted after 30 seconds",
  });
});

test("an unknown language is being detected, with no link yet", () => {
  const status = describeStatus({ inTarget: null, playing: true });
  assert.equal(status.text, "Detecting the language…");
  assert.equal(status.action, undefined);
});

test("a video that is not German can be marked as German, playing or not", () => {
  for (const playing of [true, false]) {
    assert.deepEqual(describeStatus({ inTarget: false, playing }), {
      kind: "off",
      text: "Not German, not counted",
      action: { inTarget: true, label: "Mark as German" },
    });
  }
});

test("a German video counts only while it plays, and can be marked as not German", () => {
  const playing = describeStatus({ inTarget: true, playing: true });
  assert.equal(playing.kind, "counting");
  assert.deepEqual(playing.action, { inTarget: false, label: "Not German?" });

  const paused = describeStatus({ inTarget: true, playing: false });
  assert.equal(paused.kind, "idle");
  assert.equal(paused.text, "German video, paused");
  assert.deepEqual(paused.action, { inTarget: false, label: "Not German?" });
});

test("the texts say the name of the target language", () => {
  assert.deepEqual(describeStatus({ inTarget: false, playing: true }, null, "Japanese"), {
    kind: "off",
    text: "Not Japanese, not counted",
    action: { inTarget: true, label: "Mark as Japanese" },
  });
  const counting = describeStatus({ inTarget: true, playing: true }, null, "Japanese");
  assert.equal(counting.text, "Counting Japanese");
  assert.deepEqual(counting.action, { inTarget: false, label: "Not Japanese?" });
  assert.equal(
    describeStatus({ inTarget: true, playing: false }, null, "Japanese").text,
    "Japanese video, paused",
  );
  // In the immersion profile the text names no language, and with no video neither does anything
  assert.equal(
    describeStatus({ inTarget: true, playing: true, immersion: true }, null, "Japanese").text,
    "Counting (immersion profile)",
  );
  assert.deepEqual(describeStatus(undefined, null, "Japanese"), { kind: "idle", text: "No video here" });
});

test("the watcher reports what the status needs", () => {
  const watcher = new Watcher({ send: () => {} });
  assert.deepEqual(watcher.status, { inTarget: null, playing: false });
  watcher.play(0);
  watcher.setInTarget(1, true);
  assert.deepEqual(watcher.status, { inTarget: true, playing: true });
  watcher.pause(2);
  assert.deepEqual(watcher.status, { inTarget: true, playing: false });
  watcher.newVideo(3);
  assert.equal(watcher.status.inTarget, null);
});

test("marking a video as not German stops what is counted, and marking it back resumes it", () => {
  const sent = [];
  const watcher = new Watcher({ send: (intervals) => sent.push(intervals) });
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.flush(2);
  watcher.setInTarget(3, false); // the user marks the video as not German: the last second goes too
  watcher.flush(5);
  assert.deepEqual(sent, [[{ from: 0, to: 2 }]]);
  watcher.setInTarget(6, true); // and changes their mind
  watcher.pause(8);
  assert.deepEqual(sent.at(-1), [{ from: 6, to: 8 }]);
});
