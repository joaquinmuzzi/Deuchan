import assert from "node:assert/strict";
import { test } from "node:test";

import { CSV_HEADERS, activityCsv, csvField, csvFileName } from "../extension/src/kechimochi-csv.js";

const YT = "dQw4w9WgXcQ";

test("the header is exactly Kechimochi's Activity Logs format, with no byte order mark", () => {
  assert.equal(
    CSV_HEADERS.join(","),
    "Date,Log Name,Default Activity Type,Duration,Language,Characters,Activity Type,Notes,Media Variant",
  );
  const text = activityCsv({ version: 1, days: {} }, {}, "Japanese");
  assert.equal(text, `${CSV_HEADERS.join(",")}\r\n`);
  assert.ok(!text.startsWith("﻿"));
});

test("fields with commas, quotes, line breaks or edge spaces are quoted", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("a, b"), '"a, b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
  assert.equal(csvField(" padded"), '" padded"');
  assert.equal(csvField(0), "0");
  assert.equal(csvField(null), "");
});

test("one row per day and item, with the address as the note and the rest explained", () => {
  const log = { version: 1, days: { "2026-01-01": 3600, "2026-11-25": 1800 } };
  const videos = {
    "2026-11-25": {
      [YT]: { title: "日本語, 初級", seconds: 1200 },
      "web:abc": { title: "Podcast", seconds: 300, url: "https://pod.example/ep1", kind: "sound" },
    },
  };
  const lines = activityCsv(log, videos, "Japanese").trimEnd().split("\r\n");
  assert.deepEqual(lines.slice(1), [
    "2026-01-01,Other input,Watching,60,Japanese,0,Watching,Day total counted by Inputly; its list of items is no longer kept,Inputly",
    `2026-11-25,"日本語, 初級",Watching,20,Japanese,0,Watching,,YouTube`,
    "2026-11-25,Podcast,Listening,5,Japanese,0,Listening,https://pod.example/ep1,pod.example",
    "2026-11-25,Other input,Watching,5,Japanese,0,Watching,Corrections and short items counted by Inputly,Inputly",
  ]);
});

test("each media entry gets one default activity, the one of most of its minutes", () => {
  const page = { title: "Stream", url: "https://twitch.tv/x" };
  const log = { version: 1, days: { "2026-11-24": 600, "2026-11-25": 120 } };
  const videos = {
    "2026-11-24": { "web:abc": { ...page, seconds: 600 } },
    "2026-11-25": { "web:abc": { ...page, seconds: 120, kind: "sound" } },
  };
  const lines = activityCsv(log, videos, "German").trimEnd().split("\r\n").slice(1);
  assert.equal(lines[0], "2026-11-24,Stream,Watching,10,German,0,Watching,https://twitch.tv/x,twitch.tv");
  assert.equal(lines[1], "2026-11-25,Stream,Watching,2,German,0,Listening,https://twitch.tv/x,twitch.tv");
});

test("the file is named after the day it was made", () => {
  assert.equal(csvFileName("2026-11-25"), "inputly-activity-2026-11-25.csv");
});
