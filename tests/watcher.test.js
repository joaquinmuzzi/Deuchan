import assert from "node:assert/strict";
import { test } from "node:test";

import { Watcher } from "../extension/src/watcher.js";

function setup() {
  const sent = [];
  return { sent, watcher: new Watcher({ send: (intervals) => sent.push(intervals) }) };
}

test("saves the time of a German video when it pauses", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.pause(4);
  assert.deepEqual(sent, [[{ from: 0, to: 4 }]]);
});

test("does not save the time of a video that is not German", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, false);
  watcher.play(0);
  watcher.pause(4);
  assert.deepEqual(sent, []);
});

test("keeps the time until the language is known, then credits it", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.flush(3);
  assert.deepEqual(sent, []);
  watcher.setInTarget(4, true);
  assert.deepEqual(sent, [[{ from: 0, to: 4 }]]);
});

test("drops the time kept for a video that turns out not to be German", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.flush(3);
  watcher.setInTarget(4, false);
  watcher.pause(8);
  assert.deepEqual(sent, []);
});

test("flush saves in pieces while the video keeps playing", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.flush(3);
  watcher.flush(5);
  assert.deepEqual(sent, [[{ from: 0, to: 3 }], [{ from: 3, to: 5 }]]);
});

test("a new video settles the old one and starts without a verdict", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.newVideo(3);
  watcher.flush(5);
  assert.deepEqual(sent, [[{ from: 0, to: 3 }]]);
  watcher.setInTarget(5, false);
  watcher.flush(6);
  assert.equal(sent.length, 1);
});

test("time kept without a verdict is not carried over to the next video", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.newVideo(3);
  watcher.setInTarget(3, true);
  watcher.pause(5);
  assert.deepEqual(sent, [[{ from: 3, to: 5 }]]);
});

test("the watcher reports what the status needs", () => {
  const watcher = new Watcher({ send: () => {} });
  assert.deepEqual(watcher.status, { inTarget: null, playing: false, ad: false });
  watcher.play(0);
  watcher.setInTarget(1, true);
  assert.deepEqual(watcher.status, { inTarget: true, playing: true, ad: false });
  watcher.pause(2);
  assert.deepEqual(watcher.status, { inTarget: true, playing: false, ad: false });
  watcher.newVideo(3);
  assert.equal(watcher.status.inTarget, null);
});

test("sync stops the count of a video that stopped without a pause event", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.sync(2, true);
  // The player failed and emptied the element at about 3: it is paused, and no event said so
  watcher.sync(4, false);
  watcher.flush(60);
  assert.deepEqual(sent, [[{ from: 0, to: 4 }]]);
  assert.equal(watcher.status.playing, false);
});

test("sync never starts the count", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.sync(0, true);
  watcher.flush(10);
  assert.deepEqual(sent, []);
  assert.equal(watcher.status.playing, false);
});

// Ads (task 2.8): YouTube plays them in the same video element, so the element's `playing` events fire
// during them; content.js tells the watcher when the player's `ad-showing` class comes and goes.

test("a pre-roll ad is not counted, and the video after it is", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.setAd(0, true, false);
  watcher.play(0);
  watcher.flush(2);
  watcher.flush(4);
  // The ad ends; the video's own `playing` comes a moment later
  watcher.setAd(30, false, false);
  watcher.play(30.3);
  watcher.flush(32);
  assert.deepEqual(sent, [[{ from: 30.3, to: 32 }]]);
});

test("a mid-roll ad stops the count, and the video goes on counting after it", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.flush(2);
  watcher.setAd(3, true, true);
  // Each ad of the break fires `playing` in the same element
  watcher.play(3.1);
  watcher.flush(5);
  watcher.play(18);
  watcher.flush(20);
  watcher.setAd(21, false, true);
  watcher.flush(23);
  assert.deepEqual(sent, [[{ from: 0, to: 2 }], [{ from: 2, to: 3 }], [{ from: 21, to: 23 }]]);
});

test("a skipped ad ends like any other, and its time is not counted", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.setAd(0, true, true);
  watcher.play(0);
  watcher.flush(2);
  watcher.setAd(4, false, true);
  watcher.pause(6);
  assert.deepEqual(sent, [[{ from: 4, to: 6 }]]);
});

test("the time before an ad waits for the verdict, the ad's time is not added to it", () => {
  const { sent, watcher } = setup();
  watcher.play(0);
  watcher.setAd(2, true, true);
  watcher.play(2);
  watcher.flush(4);
  watcher.setAd(10, false, true);
  watcher.setInTarget(11, true);
  assert.deepEqual(sent, [
    [
      { from: 0, to: 2 },
      { from: 10, to: 11 },
    ],
  ]);
  watcher.flush(12);
  assert.deepEqual(sent.at(-1), [{ from: 11, to: 12 }]);
});

test("an ad of a video that is not in the target language saves nothing either", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, false);
  watcher.setAd(0, true, true);
  watcher.play(0);
  watcher.setAd(5, false, true);
  watcher.pause(8);
  assert.deepEqual(sent, []);
});

test("telling the watcher the same ad state again changes nothing", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.play(0);
  watcher.setAd(1, false, true);
  watcher.setAd(2, false, true);
  watcher.pause(3);
  assert.deepEqual(sent, [[{ from: 0, to: 3 }]]);
  watcher.setAd(4, true, false);
  watcher.setAd(5, true, true);
  assert.equal(watcher.status.ad, true);
  assert.equal(watcher.status.playing, false);
});

test("an ad ending while the element is paused does not start the count", () => {
  const { sent, watcher } = setup();
  watcher.setInTarget(0, true);
  watcher.setAd(0, true, true);
  watcher.setAd(5, false, false);
  watcher.flush(8);
  assert.deepEqual(sent, []);
  assert.equal(watcher.status.playing, false);
});
