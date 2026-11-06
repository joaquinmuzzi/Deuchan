import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_TITLE_LENGTH,
  MAX_VIDEOS_PER_DAY,
  MAX_VIDEO_DAYS,
  addVideoSeconds,
  cleanVideo,
  dayVideos,
  removeVideo,
} from "../extension/src/videos.js";

const ID = "dQw4w9WgXcQ";
const OTHER = "9bVfoZu-aH4";
const DAY = "2026-10-24";

test("cleanVideo needs a real id, and tidies and limits the title", () => {
  assert.deepEqual(cleanVideo({ id: ID, title: "  Ein   Titel\n" }), { id: ID, title: "Ein Titel" });
  assert.equal(cleanVideo({ id: ID, title: "x".repeat(1000) }).title.length, MAX_TITLE_LENGTH);
  assert.deepEqual(cleanVideo({ id: ID, title: 5 }), { id: ID, title: "" });
  for (const bad of [null, undefined, {}, { id: "short" }, { id: "__proto__" }, { id: `${ID}x` }, "x"]) {
    assert.equal(cleanVideo(bad), null);
  }
});

test("the seconds of a video are added up on its day, and the given videos are not changed", () => {
  const first = addVideoSeconds({}, DAY, { id: ID, title: "A" }, 30);
  const second = addVideoSeconds(first, DAY, { id: ID, title: "A" }, 15);
  assert.equal(first[DAY][ID].seconds, 30);
  assert.equal(second[DAY][ID].seconds, 45);
});

test("a day lists its videos, the longest first", () => {
  let videos = addVideoSeconds({}, DAY, { id: ID, title: "short" }, 60);
  videos = addVideoSeconds(videos, DAY, { id: OTHER, title: "long" }, 600);
  assert.deepEqual(dayVideos(videos, DAY), [
    { id: OTHER, title: "long", seconds: 600 },
    { id: ID, title: "short", seconds: 60 },
  ]);
  assert.deepEqual(dayVideos(videos, "2026-10-23"), []);
  assert.deepEqual(dayVideos(undefined, DAY), []);
});

test("the title of the last time is kept, but an empty one does not erase it", () => {
  let videos = addVideoSeconds({}, DAY, { id: ID, title: "Old" }, 5);
  videos = addVideoSeconds(videos, DAY, { id: ID, title: "New" }, 5);
  assert.equal(videos[DAY][ID].title, "New");
  videos = addVideoSeconds(videos, DAY, { id: ID, title: "" }, 5);
  assert.equal(videos[DAY][ID].title, "New");
});

test("nothing is added for something that is not a video, a day or some seconds", () => {
  const videos = {};
  assert.equal(addVideoSeconds(videos, DAY, { id: "bad" }, 5), videos);
  assert.equal(addVideoSeconds(videos, "today", { id: ID }, 5), videos);
  assert.equal(addVideoSeconds(videos, DAY, { id: ID }, 0), videos);
  assert.equal(addVideoSeconds(videos, DAY, { id: ID }, -3), videos);
  assert.deepEqual(addVideoSeconds(undefined, DAY, null, 5), {});
});

test("only the newest days are kept", () => {
  let videos = {};
  for (let index = 0; index < MAX_VIDEO_DAYS + 5; index += 1) {
    const day = `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`;
    videos = addVideoSeconds(videos, day, { id: ID, title: "t" }, 5);
  }
  const days = Object.keys(videos);
  assert.equal(days.length, MAX_VIDEO_DAYS);
  assert.ok(!days.includes("2026-01-01"), "the oldest went");
});

test("a day keeps the videos with the most time", () => {
  let videos = {};
  for (let index = 0; index < MAX_VIDEOS_PER_DAY + 5; index += 1) {
    const id = `video${String(index).padStart(6, "0")}`;
    videos = addVideoSeconds(videos, DAY, { id, title: id }, index + 1);
  }
  const list = dayVideos(videos, DAY);
  assert.equal(list.length, MAX_VIDEOS_PER_DAY);
  assert.equal(list.at(-1).seconds, 6, "the five shortest went");
});

test("a video can be taken out of a day, and an empty day goes", () => {
  let videos = addVideoSeconds({}, DAY, { id: ID, title: "A" }, 10);
  videos = addVideoSeconds(videos, DAY, { id: OTHER, title: "B" }, 20);
  const without = removeVideo(videos, DAY, ID);
  assert.deepEqual(
    dayVideos(without, DAY).map((video) => video.id),
    [OTHER],
  );
  assert.equal(dayVideos(videos, DAY).length, 2, "the given one is not changed");
  assert.deepEqual(removeVideo(without, DAY, OTHER), {});
  assert.deepEqual(removeVideo(undefined, DAY, ID), {});
});
