import assert from "node:assert/strict";
import { test } from "node:test";

import { flushAudible, hears, readAudible, setHeard } from "../extension/src/audio.js";

const PODCAST = "https://open.spotify.com/episode/07kOaKcEppy9cOIMweojqz";

test("a tab is heard while it plays sound, is not muted and is not YouTube", () => {
  assert.equal(hears({ audible: true, url: PODCAST }), true);
  assert.equal(hears({ audible: true, url: PODCAST, mutedInfo: { muted: false } }), true);
  assert.equal(hears({ audible: false, url: PODCAST }), false);
  assert.equal(hears({ audible: true, url: PODCAST, mutedInfo: { muted: true } }), false);
  assert.equal(hears({ audible: true, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), false);
  // An embedded YouTube player is in another site's tab, and m.youtube.com has no script of its own
  assert.equal(hears({ audible: true, url: "https://m.youtube.com/watch?v=dQw4w9WgXcQ" }), true);
  assert.equal(hears({ audible: true }), true);
  assert.equal(hears(null), false);
});

test("a stretch starts when a tab is heard and is counted when it stops", () => {
  const started = setHeard({}, 4, true, 100);
  assert.deepEqual(started, { audible: { 4: 100 }, interval: null });
  // Heard again (another change of the same tab): the stretch goes on
  assert.deepEqual(setHeard(started.audible, 4, true, 130), started);
  assert.deepEqual(setHeard(started.audible, 4, false, 160), {
    audible: {},
    interval: { from: 100, to: 160 },
  });
  assert.deepEqual(setHeard({}, 4, false, 160), { audible: {}, interval: null });
});

test("every minute what each tab played is counted, and its stretch goes on from then", () => {
  const { audible, parts } = flushAudible({ 4: 100, 9: 150 }, 160);
  assert.deepEqual(audible, { 4: 160, 9: 160 });
  assert.deepEqual(parts, [
    { tabId: 4, interval: { from: 100, to: 160 } },
    { tabId: 9, interval: { from: 150, to: 160 } },
  ]);
  assert.deepEqual(flushAudible({ 4: 160 }, 160).parts, []);
});

test("only stretches are read back from storage", () => {
  assert.deepEqual(readAudible({ 4: 100, x: 5, 7: "now", 8: Number.NaN }), { 4: 100 });
  assert.deepEqual(readAudible(undefined), {});
  assert.deepEqual(readAudible("x"), {});
});
