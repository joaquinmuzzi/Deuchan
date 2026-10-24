import assert from "node:assert/strict";
import { test } from "node:test";

import { GERMAN_COLOR, IDLE_COLOR, iconColor } from "../extension/src/icon.js";

test("the icon is orange for a German video", () => {
  assert.equal(iconColor(true), GERMAN_COLOR);
});

test("the icon is grey for a video that is not German, for an unknown language and for no video", () => {
  for (const german of [false, null, undefined]) {
    assert.equal(iconColor(german), IDLE_COLOR, String(german));
  }
});

test("the two colours are different, and orange is the one of the app", () => {
  assert.notEqual(GERMAN_COLOR, IDLE_COLOR);
  assert.equal(GERMAN_COLOR, "#e8590c");
});
