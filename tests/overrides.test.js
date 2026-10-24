import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_OVERRIDES, isVideoId, verdict, withOverride } from "../extension/src/overrides.js";

test("the decision of the user wins over the guess, either way", () => {
  assert.equal(verdict({ abc12345: false }, "abc12345", true), false);
  assert.equal(verdict({ abc12345: true }, "abc12345", false), true);
});

test("without a decision the guess stands", () => {
  assert.equal(verdict({}, "abc12345", true), true);
  assert.equal(verdict(undefined, "abc12345", false), false);
  assert.equal(verdict({ other123: false }, "abc12345", true), true);
});

test("a decision that is not true or false is ignored", () => {
  assert.equal(verdict({ abc12345: "no" }, "abc12345", true), true);
  assert.equal(verdict({ abc12345: null }, "abc12345", false), false);
});

test("withOverride adds a decision without changing the given ones", () => {
  const before = { aaaaaa11: true };
  const after = withOverride(before, "bbbbbb22", false);
  assert.deepEqual(before, { aaaaaa11: true });
  assert.deepEqual(after, { aaaaaa11: true, bbbbbb22: false });
});

test("withOverride changes an old decision and makes it the newest", () => {
  const after = withOverride({ aaaaaa11: true, bbbbbb22: false }, "aaaaaa11", false);
  assert.deepEqual(Object.entries(after), [
    ["bbbbbb22", false],
    ["aaaaaa11", false],
  ]);
});

test("withOverride starts from nothing", () => {
  assert.deepEqual(withOverride(undefined, "aaaaaa11", true), { aaaaaa11: true });
});

test("withOverride forgets the oldest decisions over the limit", () => {
  let overrides = {};
  for (let index = 0; index < MAX_OVERRIDES + 3; index += 1) {
    overrides = withOverride(overrides, `video${String(index).padStart(5, "0")}`, true);
  }
  const ids = Object.keys(overrides);
  assert.equal(ids.length, MAX_OVERRIDES);
  assert.equal(ids.at(-1), `video${String(MAX_OVERRIDES + 2).padStart(5, "0")}`);
  assert.equal(overrides.video00000, undefined);
  assert.equal(overrides.video00002, undefined);
  assert.equal(overrides.video00003, true);
});

test("isVideoId accepts what YouTube uses and rejects the rest", () => {
  for (const id of ["dQw4w9WgXcQ", "abc_DEF-123"]) {
    assert.equal(isVideoId(id), true, id);
  }
  for (const id of [
    "",
    "short",
    "has space 123",
    "a".repeat(30),
    "../../etc",
    12345678,
    null,
    undefined,
    "__proto__x",
    "__proto__",
  ]) {
    assert.equal(isVideoId(id), false, String(id));
  }
});
