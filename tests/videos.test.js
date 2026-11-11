import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_TITLE_LENGTH,
  MAX_VIDEOS_PER_DAY,
  MAX_VIDEO_DAYS,
  addVideoSeconds,
  cleanVideo,
  SYNC_TITLE_LENGTH,
  SYNC_VIDEO_DAYS,
  SYNC_VIDEOS_PER_DAY,
  dayVideos,
  forSync,
  mergeVideos,
  removeVideo,
  sanitizeVideos,
} from "../extension/src/videos.js";

const ID = "dQw4w9WgXcQ";
const OTHER = "9bVfoZu-aH4";
const DAY = "2026-10-24";
const DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

test("a video taken out of a day is marked, not deleted, so that it does not come back", () => {
  let videos = addVideoSeconds({}, DAY, { id: ID, title: "A" }, 10);
  videos = addVideoSeconds(videos, DAY, { id: OTHER, title: "B" }, 20);
  const without = removeVideo(videos, DAY, ID);
  assert.deepEqual(
    dayVideos(without, DAY).map((video) => video.id),
    [OTHER],
  );
  assert.equal(dayVideos(videos, DAY).length, 2, "the given one is not changed");
  assert.deepEqual(without[DAY][ID], { title: "A", seconds: 10, off: true });
  // merging with the copy from before (another computer, an older sync) does not bring it back
  assert.deepEqual(
    dayVideos(mergeVideos(videos, without), DAY).map((video) => video.id),
    [OTHER],
  );
  assert.deepEqual(
    dayVideos(mergeVideos(without, videos), DAY).map((video) => video.id),
    [OTHER],
  );
  // and watching it again does not list it either
  assert.equal(dayVideos(addVideoSeconds(without, DAY, { id: ID, title: "A" }, 5), DAY).length, 1);
  assert.deepEqual(removeVideo(undefined, DAY, "bad"), {});
});

test("a video that only another computer saw can be taken out too", () => {
  const here = removeVideo({}, DAY, ID);
  const others = { [DEVICE]: { videos: { [DAY]: { [ID]: { title: "A", seconds: 90 } } } } };
  assert.deepEqual(
    dayVideos({}, DAY, others).map((video) => video.id),
    [ID],
  );
  assert.deepEqual(dayVideos(here, DAY, others), []);
});

test("the list of a day has the videos of all the computers, and the seconds of a video watched on two are added", () => {
  const mine = { [DAY]: { [ID]: { title: "Same", seconds: 60 }, [OTHER]: { title: "Mine", seconds: 10 } } };
  const others = {
    [DEVICE]: {
      videos: {
        [DAY]: { [ID]: { title: "Same", seconds: 120 }, abcdefghijk: { title: "Theirs", seconds: 300 } },
      },
    },
    bbbbbbbb: {},
  };
  assert.deepEqual(dayVideos(mine, DAY, others), [
    { id: "abcdefghijk", title: "Theirs", seconds: 300 },
    { id: ID, title: "Same", seconds: 180 },
    { id: OTHER, title: "Mine", seconds: 10 },
  ]);
  assert.deepEqual(dayVideos(mine, DAY, null).length, 2);
});

test("sanitizeVideos keeps what makes sense and nothing that can be a dangerous key", () => {
  const dirty = JSON.parse(
    `{"${DAY}":{"${ID}":{"title":"  A  ","seconds":5,"off":true},"__proto__":{"seconds":1},"short":{"seconds":1},"${OTHER}":{"seconds":-1},"abcdefghijk":{"seconds":"x"}},"bad":{"${ID}":{"seconds":1}},"2026-10-23":null}`,
  );
  assert.deepEqual(sanitizeVideos(dirty), { [DAY]: { [ID]: { title: "A", seconds: 5, off: true } } });
  assert.deepEqual(sanitizeVideos({ [DAY]: { [ID]: { seconds: 999_999 } } })[DAY][ID].seconds, 86_400);
  for (const bad of [undefined, null, 5, "x"]) {
    assert.deepEqual(sanitizeVideos(bad), {});
  }
});

test("two copies of a video keep the larger seconds and the title of that copy, in any order", () => {
  const a = { [DAY]: { [ID]: { title: "Old", seconds: 10 } } };
  const b = { [DAY]: { [ID]: { title: "New", seconds: 30 }, [OTHER]: { title: "B", seconds: 5 } } };
  const expected = { [DAY]: { [ID]: { title: "New", seconds: 30 }, [OTHER]: { title: "B", seconds: 5 } } };
  assert.deepEqual(mergeVideos(a, b), expected);
  assert.deepEqual(mergeVideos(b, a), expected);
  assert.deepEqual(mergeVideos(b, b), b);
});

test("only the recent days and the longest videos are synced, with shorter titles", () => {
  let videos = {};
  for (let index = 0; index < 20; index += 1) {
    const day = `2026-10-${String(index + 1).padStart(2, "0")}`;
    for (let video = 0; video < SYNC_VIDEOS_PER_DAY + 5; video += 1) {
      videos = addVideoSeconds(
        videos,
        day,
        { id: `video${String(video).padStart(6, "0")}`, title: "t".repeat(180) },
        video + 1,
      );
    }
  }
  const sent = forSync(videos);
  assert.equal(Object.keys(sent).length, SYNC_VIDEO_DAYS);
  assert.ok(!("2026-10-01" in sent), "the oldest days are not sent");
  const day = Object.values(sent).at(-1);
  assert.equal(Object.keys(day).length, SYNC_VIDEOS_PER_DAY);
  assert.ok(Object.values(day).every((entry) => entry.title.length <= SYNC_TITLE_LENGTH));
  assert.equal(Math.min(...Object.values(day).map((entry) => entry.seconds)), 6, "the longest ones");
  assert.equal(Object.keys(videos).length, 20, "nothing is lost on this computer");
});

test("a video taken out is always sent, even if it is short", () => {
  let videos = {};
  for (let video = 0; video < SYNC_VIDEOS_PER_DAY + 5; video += 1) {
    videos = addVideoSeconds(
      videos,
      DAY,
      { id: `video${String(video).padStart(6, "0")}`, title: "t" },
      100 + video,
    );
  }
  videos = removeVideo(videos, DAY, "video000000");
  assert.equal(forSync(videos)[DAY].video000000.off, true);
});
