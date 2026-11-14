import assert from "node:assert/strict";
import { test } from "node:test";

import { describeMosaik, describeQueue, mosaikErrorText } from "../extension/src/mosaik-status.js";

const NOW = 10_000_000_000;
const MINUTE = 60_000;

test("off is off, whatever the state says", () => {
  assert.deepEqual(describeMosaik({ enabled: false }, { status: "ok", lastSentAt: NOW }, NOW), {
    tone: "off",
    text: "Off",
  });
});

test("a good sending says when", () => {
  assert.deepEqual(describeMosaik({ enabled: true }, { status: "ok", lastSentAt: NOW - 3 * MINUTE }, NOW), {
    tone: "ok",
    text: "Sent 3 min ago",
  });
  assert.equal(describeMosaik({ enabled: true }, { status: "waiting" }, NOW).text, "Waiting to send…");
  assert.equal(describeMosaik({ enabled: true }, undefined, NOW).text, "Waiting to send…");
});

test("a sending that is going on says so, unless it was stopped long ago", () => {
  assert.equal(
    describeMosaik({ enabled: true }, { status: "sending", startedAt: NOW - 1000 }, NOW).tone,
    "busy",
  );
  const stale = describeMosaik(
    { enabled: true },
    { status: "sending", startedAt: NOW - 10 * MINUTE, lastSentAt: NOW - 10 * MINUTE },
    NOW,
  );
  assert.equal(stale.text, "Sent 10 min ago");
});

test("each problem has its own words, and the hub's own reason when it gave one", () => {
  const say = (state) => describeMosaik({ enabled: true }, state, NOW);
  assert.match(say({ status: "not-running" }).text, /not running/);
  assert.match(say({ status: "outdated" }).text, /Update Mosaik/);
  assert.match(say({ status: "permission-missing" }).text, /permission/);
  assert.match(say({ status: "forbidden", lastError: "origin not allowed" }).text, /origin not allowed/);
  assert.match(say({ status: "bad-request", lastError: "seconds is not a number" }).text, /seconds is not/);
  assert.match(say({ status: "error", lastError: "server" }).text, /had a problem/);
  assert.match(say({ status: "error", lastError: "http-418" }).text, /418/);
  for (const state of [{ status: "not-running" }, { status: "error", lastError: "server" }]) {
    assert.equal(say(state).tone, "warn");
  }
});

test("every error has words, an unknown one too", () => {
  for (const kind of [
    "not-running",
    "not-mosaik",
    "invalid-url",
    "permission-missing",
    "off",
    "nonsense",
    undefined,
  ]) {
    assert.ok(mosaikErrorText(kind).length > 0, String(kind));
  }
});

test("the numbers say what waits, what was refused and what was dropped", () => {
  assert.equal(describeQueue(1, {}), "1 event waiting");
  assert.equal(describeQueue(0, undefined), "0 events waiting");
  assert.equal(
    describeQueue(12, { rejected: 2, dropped: 40 }),
    "12 events waiting · 2 refused · 40 dropped (the queue was full)",
  );
});
