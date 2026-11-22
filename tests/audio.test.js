import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_SOUND_SECONDS,
  flushSound,
  forgetSound,
  hears,
  isCounting,
  readSound,
  setHeard,
} from "../extension/src/audio.js";

const PODCAST = "https://open.spotify.com/episode/07kOaKcEppy9cOIMweojqz";
const WORD = "https://lexikon.example/entry/1/wort";
const NOTHING = { open: {}, proven: {} };

const tab = (url, id = 4) => ({ id, url, title: "T" });

/** The sound and the intervals counted after `[second, tab, heard]` steps. */
function play(steps, sound = NOTHING) {
  const counted = [];
  for (const [at, shown, heard] of steps) {
    const result = setHeard(sound, shown, heard, at);
    sound = result.sound;
    if (result.interval) {
      counted.push(result.interval);
    }
  }
  return { sound, counted };
}

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

test("a stretch long enough is counted from its start when it stops", () => {
  const { sound, counted } = play([
    [100, tab(PODCAST), true],
    // Heard again (another change of the same tab): the stretch goes on
    [130, tab(PODCAST), true],
    [160, tab(PODCAST), false],
  ]);
  assert.deepEqual(counted, [{ from: 100, to: 160 }]);
  assert.deepEqual(sound, { open: {}, proven: { 4: "open.spotify.com" } });
  assert.deepEqual(play([[160, tab(PODCAST), false]]), { sound: NOTHING, counted: [] });
});

test("a short sound, like a word a dictionary says, does not count, however often it is heard", () => {
  const steps = [];
  for (let at = 0; at < 600; at += 6) {
    steps.push([at, tab(WORD), true], [at + 3, tab(WORD), false]);
  }
  assert.deepEqual(play(steps), { sound: NOTHING, counted: [] });
  const almost = play([
    [0, tab(WORD), true],
    [MIN_SOUND_SECONDS - 0.1, tab(WORD), false],
  ]);
  assert.deepEqual(almost, { sound: NOTHING, counted: [] });
});

test("once a site has proven itself in a tab, its short stretches count too", () => {
  const { counted } = play([
    [0, tab(PODCAST), true],
    [MIN_SOUND_SECONDS, tab(PODCAST), false],
    [50, tab(PODCAST + "2"), true],
    [55, tab(PODCAST + "2"), false],
    // Another tab has proven nothing
    [60, tab(PODCAST, 9), true],
    [65, tab(PODCAST, 9), false],
  ]);
  assert.deepEqual(counted, [
    { from: 0, to: MIN_SOUND_SECONDS },
    { from: 50, to: 55 },
  ]);
});

test("another site in the same tab starts from nothing, and the first one stays proven", () => {
  const { sound, counted } = play([
    [0, tab(PODCAST), true],
    // The address changes while the tab is still said to be audible
    [60, tab(WORD), true],
    [62, tab(WORD), false],
    [70, tab(WORD), true],
    [73, tab(WORD), false],
    [80, tab(PODCAST), true],
    [85, tab(PODCAST), false],
  ]);
  assert.deepEqual(counted, [
    { from: 0, to: 60 },
    { from: 80, to: 85 },
  ]);
  assert.deepEqual(sound.proven, { 4: "open.spotify.com" });
});

test("a tab that is closed, or is said to be not German, has to prove itself again", () => {
  const { sound } = play([
    [0, tab(PODCAST), true],
    [60, tab(PODCAST), false],
    [61, tab(PODCAST), true],
  ]);
  assert.deepEqual(forgetSound(sound, 4), NOTHING);
});

test("every minute what each tab played is counted, and its stretch goes on from then", () => {
  const { sound } = play([
    [100, tab(PODCAST), true],
    [150, tab(WORD, 9), true],
  ]);
  const first = flushSound(sound, 160);
  // The second one has not lasted enough yet: it waits, and then counts from its start
  assert.deepEqual(first.parts, [{ tabId: 4, interval: { from: 100, to: 160 } }]);
  assert.equal(first.sound.open[4].since, 160);
  assert.equal(first.sound.open[9].since, 150);
  assert.deepEqual(flushSound(first.sound, 160).parts, []);
  const second = flushSound(first.sound, 220);
  assert.deepEqual(second.parts, [
    { tabId: 4, interval: { from: 160, to: 220 } },
    { tabId: 9, interval: { from: 150, to: 220 } },
  ]);
  // What is left after a minute counts, however short
  assert.deepEqual(setHeard(second.sound, tab(PODCAST), false, 225).interval, { from: 220, to: 225 });
});

test("the popup knows when the sound of a tab counts", () => {
  const { sound } = play([[100, tab(PODCAST), true]]);
  assert.equal(isCounting(sound, 4, 110), false);
  assert.equal(isCounting(sound, 4, 100 + MIN_SOUND_SECONDS), true);
  assert.equal(isCounting({ ...sound, proven: { 4: "open.spotify.com" } }, 4, 101), true);
  assert.equal(isCounting({ ...sound, proven: { 4: "lexikon.example" } }, 4, 101), false);
  assert.equal(isCounting(sound, 9, 200), false);
});

test("a stretch keeps the page its tab showed the last time", () => {
  const { sound } = play([
    [100, tab(PODCAST), true],
    [110, { id: 4, url: PODCAST + "2", title: "Folge 2" }, true],
  ]);
  assert.deepEqual(sound.open[4], {
    since: 100,
    site: "open.spotify.com",
    url: PODCAST + "2",
    title: "Folge 2",
  });
});

test("only sound is read back from storage", () => {
  const stretch = { since: 100, site: "a.example", url: "https://a.example/", title: "A" };
  const open = { 4: stretch, x: stretch, 7: { ...stretch, since: "now" }, 8: 100, 9: null };
  assert.deepEqual(readSound({ open, proven: { 4: "a.example", 5: 1, x: "a.example" } }), {
    open: { 4: stretch },
    proven: { 4: "a.example" },
  });
  for (const saved of [undefined, null, "x", {}, { open: [], proven: 3 }]) {
    assert.deepEqual(readSound(saved), NOTHING);
  }
});
