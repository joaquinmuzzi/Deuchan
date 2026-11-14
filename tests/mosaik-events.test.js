import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JOIN_GAP_MS,
  MAX_EVENT_MS,
  MAX_QUEUED,
  addToQueue,
  addWatched,
  backfillEvents,
  changedDays,
  closeIdle,
  dayTotalEvent,
  emptyOutbox,
  pendingCount,
  readOutbox,
  removeSent,
  takeBatch,
  toMs,
  videoRemovedEvent,
} from "../extension/src/mosaik-events.js";
import { batchProblems, eventProblems } from "./mosaik-contract.js";

const VIDEO = { id: "dQw4w9WgXcQ", title: "Easy German 500" };
const OTHER = { id: "9bVfoZu-aH4", title: "Nicos Weg" };
const START = 1_794_670_000; // seconds, as Deuchan keeps them

/** Ids that are new each time and easy to read in a failure. */
function uuids() {
  let next = 0;
  return () => `uuid-${(next += 1)}`;
}

/** The reports of a video that plays without a break: one every two seconds. */
function play(outbox, video, fromSeconds, count, uuid) {
  let result = outbox;
  for (let index = 0; index < count; index += 1) {
    const from = fromSeconds + index * 2;
    result = addWatched(result, { from, to: from + 2 }, 2, video, uuid);
  }
  return result;
}

test("the reports of a video that plays are joined into one open event, in milliseconds", () => {
  const outbox = play(emptyOutbox(), VIDEO, START + 0.25, 5, uuids());
  assert.deepEqual(outbox.queued, []);
  assert.deepEqual(outbox.open, {
    id: "deuchan:iv:uuid-1",
    source: "deuchan",
    kind: "watch_interval",
    language: "de",
    from: toMs(START + 0.25),
    to: toMs(START + 10.25),
    seconds: 10,
    videoId: VIDEO.id,
    title: VIDEO.title,
  });
  assert.equal(outbox.open.from, 1_794_670_000_250);
});

test("a gap of 30 seconds joins, one of 31 does not", () => {
  const uuid = uuids();
  const first = addWatched(emptyOutbox(), { from: START, to: START + 2 }, 2, VIDEO, uuid);
  const joined = addWatched(first, { from: START + 32, to: START + 34 }, 2, VIDEO, uuid);
  assert.equal(joined.queued.length, 0);
  assert.equal(joined.open.to, toMs(START + 34));
  assert.equal(joined.open.seconds, 4);

  const apart = addWatched(first, { from: START + 33, to: START + 35 }, 2, VIDEO, uuid);
  assert.equal(apart.queued.length, 1);
  assert.equal(apart.queued[0].id, "deuchan:iv:uuid-1");
  assert.equal(apart.open.id, "deuchan:iv:uuid-2");
  assert.equal(JOIN_GAP_MS, 30_000);
});

test("another video closes the open event and opens its own", () => {
  const uuid = uuids();
  let outbox = play(emptyOutbox(), VIDEO, START, 3, uuid);
  outbox = addWatched(outbox, { from: START + 6, to: START + 8 }, 2, OTHER, uuid);
  assert.deepEqual(
    outbox.queued.map((event) => [event.videoId, event.seconds]),
    [[VIDEO.id, 6]],
  );
  assert.equal(outbox.open.videoId, OTHER.id);
});

test("an event that lasted ten minutes is closed, so that a long video sends events as it plays", () => {
  const outbox = play(emptyOutbox(), VIDEO, START, 400, uuids()); // 800 seconds
  assert.equal(outbox.queued.length, 1);
  const closed = outbox.queued[0];
  assert.ok(closed.to - closed.from >= MAX_EVENT_MS && closed.to - closed.from < MAX_EVENT_MS + 3000);
  assert.equal(outbox.open.from, closed.to);
  assert.equal(closed.seconds + outbox.open.seconds, 800);
});

test("time with nothing new, or with no video, makes no event", () => {
  const outbox = emptyOutbox();
  assert.equal(addWatched(outbox, { from: START, to: START + 2 }, 0, VIDEO, uuids()), outbox);
  assert.equal(addWatched(outbox, { from: START, to: START + 2 }, -1, VIDEO, uuids()), outbox);
  assert.equal(addWatched(outbox, { from: START, to: START + 2 }, 2, null, uuids()), outbox);
  assert.equal(addWatched(outbox, { from: START, to: START + 2 }, 2, { id: "short" }, uuids()), outbox);
});

test("the seconds of an event are never more than how long it lasted", () => {
  const uuid = uuids();
  // the reports say a little more than their length, as the clocks of two tabs can
  let outbox = emptyOutbox();
  for (let index = 0; index < 5; index += 1) {
    outbox = addWatched(
      outbox,
      { from: START + index * 2, to: START + index * 2 + 2.0004 },
      2.0009,
      VIDEO,
      uuid,
    );
  }
  outbox = closeIdle(outbox, toMs(START + 100));
  const [event] = outbox.queued;
  assert.ok(
    event.seconds <= (event.to - event.from) / 1000,
    `${event.seconds} in ${event.to - event.from} ms`,
  );
  assert.deepEqual(eventProblems(event), []);
});

test("an open event is closed after 30 seconds with nothing new, not before", () => {
  const outbox = play(emptyOutbox(), VIDEO, START, 3, uuids());
  assert.equal(closeIdle(outbox, outbox.open.to + JOIN_GAP_MS), outbox);
  const closed = closeIdle(outbox, outbox.open.to + JOIN_GAP_MS + 1);
  assert.equal(closed.open, null);
  assert.equal(closed.queued.length, 1);
  assert.equal(pendingCount(outbox), 1);
  assert.equal(pendingCount(closed), 1);
});

test("an event without a title has no title field", () => {
  const outbox = addWatched(
    emptyOutbox(),
    { from: START, to: START + 2 },
    2,
    { id: VIDEO.id, title: "" },
    uuids(),
  );
  assert.ok(!("title" in outbox.open));
  const long = addWatched(
    emptyOutbox(),
    { from: START, to: START + 2 },
    2,
    { id: VIDEO.id, title: "x".repeat(900) },
    uuids(),
  );
  assert.equal(long.open.title.length, 500);
});

test("the total of a day has its own id at each moment, and the videos of the day", () => {
  const videos = { "2026-11-14": { [VIDEO.id]: { title: VIDEO.title, seconds: 1200.25 } } };
  const first = dayTotalEvent("2026-11-14", 1_794_670_420_000, 5430.9, videos);
  assert.deepEqual(first, {
    id: "deuchan:day:2026-11-14:1794670420000",
    source: "deuchan",
    kind: "day_total",
    language: "de",
    day: "2026-11-14",
    at: 1_794_670_420_000,
    seconds: 5430,
    videos: [{ videoId: VIDEO.id, title: VIDEO.title, seconds: 1200.25 }],
  });
  const later = dayTotalEvent("2026-11-14", 1_794_670_480_000, 5490, videos);
  assert.notEqual(later.id, first.id);
  assert.ok(!("videos" in dayTotalEvent("2026-11-13", 1_794_670_420_000, 60, videos)));
});

test("a day keeps at most 200 videos, and never a video taken out", () => {
  const day = {};
  for (let index = 0; index < 250; index += 1) {
    day[`v${String(index).padStart(10, "0")}`] = { title: "t", seconds: index + 1 };
  }
  assert.equal(dayTotalEvent("2026-11-14", 1, 60, { "2026-11-14": day }).videos.length, 200);
});

test("a removal names the day, the video and the moment", () => {
  assert.deepEqual(videoRemovedEvent("2026-11-14", 1_794_670_420_000, VIDEO.id), {
    id: `deuchan:rm:2026-11-14:${VIDEO.id}:1794670420000`,
    source: "deuchan",
    kind: "video_removed",
    language: "de",
    day: "2026-11-14",
    at: 1_794_670_420_000,
    videoId: VIDEO.id,
  });
});

test("only the days whose total changed are sent again, a day corrected to zero included", () => {
  const sent = { "2026-11-12": 600, "2026-11-13": 900, "2026-11-11": 300 };
  const shown = { "2026-11-12": 600.7, "2026-11-13": 960, "2026-11-14": 30 };
  assert.deepEqual(changedDays(shown, sent), [
    { day: "2026-11-11", seconds: 0 },
    { day: "2026-11-13", seconds: 960 },
    { day: "2026-11-14", seconds: 30 },
  ]);
  assert.deepEqual(changedDays(shown, { ...sent, "2026-11-11": 0, "2026-11-13": 960, "2026-11-14": 30 }), []);
  assert.deepEqual(
    changedDays({ "2026-11-14": 0.4 }, {}),
    [],
    "a day with less than a second is nothing to send",
  );
});

test("a newer total of a day replaces the one still waiting", () => {
  let outbox = addToQueue(emptyOutbox(), [
    dayTotalEvent("2026-11-14", 1, 60, {}),
    dayTotalEvent("2026-11-13", 1, 5, {}),
  ]);
  outbox = addToQueue(outbox, [dayTotalEvent("2026-11-14", 2, 120, {})]);
  assert.deepEqual(
    outbox.queued.map((event) => event.id),
    ["deuchan:day:2026-11-13:1", "deuchan:day:2026-11-14:2"],
  );
});

test("a full queue drops the oldest intervals first and counts what it dropped", () => {
  const intervals = Array.from({ length: MAX_QUEUED - 1 }, (_, index) => ({
    id: `deuchan:iv:${index}`,
    kind: "watch_interval",
  }));
  let outbox = addToQueue(emptyOutbox(), [dayTotalEvent("2026-11-01", 1, 60, {}), ...intervals]);
  outbox = addToQueue(outbox, [dayTotalEvent("2026-11-14", 2, 60, {})]);
  assert.equal(outbox.queued.length, MAX_QUEUED);
  assert.equal(outbox.dropped, 1);
  assert.equal(outbox.queued[0].id, "deuchan:day:2026-11-01:1", "the totals stay");
  assert.equal(outbox.queued[1].id, "deuchan:iv:1", "the oldest interval went");
});

test("the history is one total for every day, with the videos where they were kept", () => {
  const shown = { "2026-11-14": 5430, "2026-09-01": 60, "2026-11-13": 0.2 };
  const videos = { "2026-11-14": { [VIDEO.id]: { title: VIDEO.title, seconds: 1200 } } };
  const events = backfillEvents(shown, videos, 1_794_670_420_000);
  assert.deepEqual(
    events.map((event) => [event.day, event.seconds, event.videos?.length ?? 0]),
    [
      ["2026-09-01", 60, 0],
      ["2026-11-14", 5430, 1],
    ],
  );
  assert.deepEqual(batchProblems({ events }), []);
});

test("a batch is taken from the front, and only the events sent leave the queue", () => {
  let outbox = addToQueue(emptyOutbox(), [
    dayTotalEvent("2026-11-12", 1, 1, {}),
    dayTotalEvent("2026-11-13", 1, 1, {}),
    dayTotalEvent("2026-11-14", 1, 1, {}),
  ]);
  const batch = takeBatch(outbox, 2);
  assert.deepEqual(
    batch.map((event) => event.day),
    ["2026-11-12", "2026-11-13"],
  );
  // while it was being sent, something else arrived
  outbox = addToQueue(outbox, [videoRemovedEvent("2026-11-14", 5, VIDEO.id)]);
  outbox = removeSent(
    outbox,
    batch.map((event) => event.id),
  );
  assert.deepEqual(
    outbox.queued.map((event) => event.kind),
    ["day_total", "video_removed"],
  );
  assert.equal(takeBatch(addToQueue(emptyOutbox(), Array(900).fill({ id: "x" })), 900).length, 500);
});

test("a queue that cannot be read is an empty one", () => {
  for (const saved of [undefined, null, 5, "x", { open: 5, queued: "no", dropped: "a" }]) {
    assert.deepEqual(readOutbox(saved), emptyOutbox());
  }
  const saved = { open: { id: "a" }, queued: [{ id: "b" }], dropped: 3 };
  assert.deepEqual(readOutbox(saved), saved);
});

test("every event the extension makes follows the contract of Mosaik", () => {
  const uuid = () => crypto.randomUUID();
  let outbox = play(emptyOutbox(), VIDEO, START, 400, uuid);
  outbox = play(outbox, OTHER, START + 800, 10, uuid);
  outbox = closeIdle(outbox, toMs(START + 2000));
  const videos = { "2026-11-14": { [VIDEO.id]: { title: VIDEO.title, seconds: 800 } } };
  const events = [
    ...outbox.queued,
    dayTotalEvent("2026-11-14", 1_794_672_000_000, 820, videos),
    dayTotalEvent("2026-11-13", 1_794_672_000_000, 0, videos),
    videoRemovedEvent("2026-11-14", 1_794_672_000_001, VIDEO.id),
  ];
  assert.equal(outbox.queued.length, 3);
  assert.deepEqual(batchProblems({ events }), []);
});
