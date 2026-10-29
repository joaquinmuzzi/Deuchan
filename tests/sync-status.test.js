import assert from "node:assert/strict";
import { test } from "node:test";

import { describeSync, errorText, timeAgo } from "../extension/src/sync-status.js";

const NOW = 10_000_000_000;
const ago = (ms) => NOW - ms;
const MINUTE = 60_000;

test("timeAgo says how long ago in the biggest unit that fits", () => {
  assert.equal(timeAgo(ago(0), NOW), "just now");
  assert.equal(timeAgo(ago(44_000), NOW), "just now");
  assert.equal(timeAgo(ago(2 * MINUTE), NOW), "2 min ago");
  assert.equal(timeAgo(ago(59 * MINUTE), NOW), "59 min ago");
  assert.equal(timeAgo(ago(3 * 60 * MINUTE), NOW), "3 h ago");
  assert.equal(timeAgo(ago(24 * 60 * MINUTE), NOW), "1 day ago");
  assert.equal(timeAgo(ago(3 * 24 * 60 * MINUTE), NOW), "3 days ago");
});

test("a time in the future is just now, not a negative number", () => {
  assert.equal(timeAgo(NOW + 5 * MINUTE, NOW), "just now");
});

test("without a key sync is off, whatever the state says", () => {
  assert.deepEqual(describeSync({ hasKey: false }, { status: "ok", lastSync: NOW }, NOW), {
    tone: "off",
    text: "Sync is off",
  });
  assert.deepEqual(describeSync({ hasKey: false }, undefined, NOW), { tone: "off", text: "Sync is off" });
});

test("a good sync says when and with how many devices", () => {
  const state = { status: "ok", lastSync: ago(2 * MINUTE), devices: 2 };
  assert.deepEqual(describeSync({ hasKey: true }, state, NOW), {
    tone: "ok",
    text: "Synced 2 min ago · 2 devices",
  });
  assert.equal(
    describeSync({ hasKey: true }, { ...state, devices: 1 }, NOW).text,
    "Synced 2 min ago · 1 device",
  );
});

test("a round that is running says so, unless it started long ago and never ended", () => {
  assert.deepEqual(describeSync({ hasKey: true }, { status: "syncing", startedAt: ago(5_000) }, NOW), {
    tone: "busy",
    text: "Syncing…",
  });
  const stale = { status: "syncing", startedAt: ago(5 * MINUTE), lastSync: ago(10 * MINUTE), devices: 2 };
  assert.equal(describeSync({ hasKey: true }, stale, NOW).tone, "ok", "it shows the last good sync instead");
});

test("an error has its own words, and the last good sync is not hidden by it", () => {
  for (const kind of [
    "network",
    "rate-limited",
    "auth",
    "full",
    "too-large",
    "corrupt",
    "conflict",
    "server",
    "no-data",
  ]) {
    const described = describeSync({ hasKey: true }, { status: "error", error: kind }, NOW);
    assert.equal(described.tone, "warn", kind);
    assert.equal(described.text, errorText(kind), kind);
    assert.notEqual(described.text, "Sync failed. It will try again soon.", kind);
  }
});

test("an error nobody knows still says something", () => {
  assert.equal(describeSync({ hasKey: true }, { status: "error", error: "unknown" }, NOW).tone, "warn");
  assert.equal(errorText("surprise"), "Sync failed.");
});

test("a key that has not synced yet says it is waiting", () => {
  assert.deepEqual(describeSync({ hasKey: true }, undefined, NOW), {
    tone: "busy",
    text: "Waiting to sync…",
  });
});
