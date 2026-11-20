import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_PAGES_PER_TAB,
  SETTLE_SECONDS,
  forgetTab,
  splitByPage,
  trackPage,
} from "../extension/src/pages.js";

const TAB = 7;
const A = "https://www.twitch.tv/lumiimari";
const B = "https://www.twitch.tv/lumizap";

/** A tab that showed A, titled, and moved to B at second 100. */
function moved() {
  let pages = trackPage({}, TAB, { url: A, title: "LumiiMari - Twitch" }, 0);
  pages = trackPage(pages, TAB, { title: "LumiiMari - Twitch" }, 1);
  return trackPage(pages, TAB, { url: B, title: "LumiiMari - Twitch" }, 100);
}

test("a new address keeps the title of the page before until the title changes", () => {
  const pages = moved();
  assert.deepEqual(pages[TAB].at(-1), { url: B, since: 100, title: "LumiiMari - Twitch", titled: false });
  const titled = trackPage(pages, TAB, { url: B, title: "Lumizap - Twitch" }, 101);
  assert.deepEqual(titled[TAB].at(-1), { url: B, since: 100, title: "Lumizap - Twitch", titled: true });
  assert.equal(trackPage(titled, TAB, { url: B, title: "Lumizap - Twitch" }, 102), titled);
});

test("the time just after a change of address has no title, not the one of the page before", () => {
  const parts = splitByPage(moved(), TAB, [{ from: 99, to: 101 }], null, 101);
  assert.deepEqual(parts, [
    { url: A, title: "LumiiMari - Twitch", intervals: [{ from: 99, to: 100 }] },
    { url: B, title: "", intervals: [{ from: 100, to: 101 }] },
  ]);
});

test("once the title changes, the new page has it", () => {
  const pages = trackPage(moved(), TAB, { title: "Lumizap - Twitch" }, 101);
  const parts = splitByPage(pages, TAB, [{ from: 101, to: 103 }], null, 103);
  assert.deepEqual(parts, [{ url: B, title: "Lumizap - Twitch", intervals: [{ from: 101, to: 103 }] }]);
});

test("a page whose title stays the same has it once the address stayed long enough", () => {
  const now = 100 + SETTLE_SECONDS;
  const parts = splitByPage(moved(), TAB, [{ from: now - 1, to: now }], null, now);
  assert.deepEqual(parts, [{ url: B, title: "LumiiMari - Twitch", intervals: [{ from: now - 1, to: now }] }]);
});

test("a page left before its title changed keeps no title", () => {
  let pages = trackPage(moved(), TAB, { url: A, title: "LumiiMari - Twitch" }, 101);
  pages = trackPage(pages, TAB, { title: "LumiiMari - Twitch!" }, 102);
  const parts = splitByPage(pages, TAB, [{ from: 100, to: 101 }], null, 200);
  assert.deepEqual(parts, [{ url: B, title: "", intervals: [{ from: 100, to: 101 }] }]);
});

test("a tab whose pages were not seen is named after the tab as it is", () => {
  const intervals = [{ from: 1, to: 2 }];
  assert.deepEqual(splitByPage({}, TAB, intervals, { url: A, title: "X" }, 3), [
    { url: A, title: "X", intervals },
  ]);
});

test("the first page known also takes the time before it", () => {
  const pages = trackPage({}, TAB, { url: A, title: "LumiiMari - Twitch" }, 50);
  const parts = splitByPage(pages, TAB, [{ from: 40, to: 60 }], null, 60);
  assert.deepEqual(parts, [{ url: A, title: "LumiiMari - Twitch", intervals: [{ from: 40, to: 60 }] }]);
});

test("only the newest pages of a tab are kept, and a closed tab is forgotten", () => {
  let pages = {};
  for (let index = 0; index < MAX_PAGES_PER_TAB + 5; index += 1) {
    pages = trackPage(pages, TAB, { url: `${A}?p=${index}`, title: "T" }, index);
  }
  assert.equal(pages[TAB].length, MAX_PAGES_PER_TAB);
  assert.deepEqual(forgetTab(pages, TAB), {});
});
