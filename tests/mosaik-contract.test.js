// The checker of the contract with Mosaik, checked itself: it takes the example of the contract and
// refuses what the contract refuses, so that a test that uses it means something.
import assert from "node:assert/strict";
import { test } from "node:test";

import { batchProblems, eventProblems } from "./mosaik-contract.js";

// The example batch of the contract, as Mosaik wrote it
const EXAMPLE = {
  events: [
    {
      id: "deuchan:iv:1b0e4c8e-7a51-4c52-9d0b-2f3c4a5b6c7d",
      source: "deuchan",
      kind: "watch_interval",
      language: "de",
      from: 1794670000000,
      to: 1794670418000,
      seconds: 417.6,
      videoId: "dQw4w9WgXcQ",
      title: "Easy German 500",
    },
    {
      id: "deuchan:day:2026-11-14:1794670420000",
      source: "deuchan",
      kind: "day_total",
      language: "de",
      day: "2026-11-14",
      at: 1794670420000,
      seconds: 5430,
      videos: [{ videoId: "dQw4w9WgXcQ", title: "Easy German 500", seconds: 1200 }],
    },
  ],
};

test("the example of the contract is valid", () => {
  assert.deepEqual(batchProblems(EXAMPLE), []);
});

test("what the contract refuses is refused", () => {
  const [interval, total] = EXAMPLE.events;
  const broken = [
    { ...interval, from: 1794670000000.5 },
    { ...interval, to: interval.from },
    { ...interval, seconds: 0 },
    { ...interval, seconds: 21_601, to: interval.from + 30_000_000 },
    { ...interval, seconds: 420 }, // more than the 418 s it lasted, plus the second of tolerance
    { ...interval, videoId: "short" },
    { ...interval, title: "x".repeat(501) },
    { ...interval, language: "en" },
    { ...interval, source: "other" },
    { ...interval, kind: "nothing" },
    { ...interval, id: "x".repeat(201) },
    { ...interval, extra: 1 },
    { ...total, seconds: 90_001 },
    { ...total, day: "14/11/2026" },
    { ...total, at: 1.5 },
    { ...total, id: "deuchan:day:2026-11-14" },
    { ...total, videos: Array(201).fill(total.videos[0]) },
    { ...total, videos: [{ videoId: "dQw4w9WgXcQ", seconds: 5 }] },
  ];
  for (const event of broken) {
    assert.notDeepEqual(eventProblems(event), [], JSON.stringify(event).slice(0, 120));
  }
});

test("a batch has 1 to 500 events, and no id twice", () => {
  assert.notDeepEqual(batchProblems({ events: [] }), []);
  assert.notDeepEqual(batchProblems({ events: Array(501).fill(EXAMPLE.events[1]) }), []);
  assert.notDeepEqual(batchProblems({ events: [EXAMPLE.events[1], EXAMPLE.events[1]] }), []);
  assert.notDeepEqual(batchProblems({}), []);
});
