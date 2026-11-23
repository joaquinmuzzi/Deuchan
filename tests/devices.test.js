// What makes Deuchan count on any site and by hand, and show the time of every computer with Mosaik.
import assert from "node:assert/strict";
import { test } from "node:test";

import { immersionOf, immersionScript } from "../extension/src/immersion.js";
import { cleanUrl, isItemId, itemUrl, siteOf, webItemId } from "../extension/src/items.js";
import {
  IDLE_SECONDS,
  MAX_SESSION_SECONDS,
  flushManual,
  manualItem,
  readManual,
  startManual,
} from "../extension/src/manual.js";
import {
  cleanDaysAnswer,
  dayItems,
  dayRange,
  hasOthers,
  othersOn,
  withOtherDevices,
} from "../extension/src/mosaik-days.js";
import { describeManual, describeStatus } from "../extension/src/status.js";
import { addVideoSeconds, cleanVideo, dayVideos, readingSeconds } from "../extension/src/videos.js";

const DAY = "2026-11-18";
const TODAY = new Date(2026, 10, 18, 12);
const VIDEO = "dQw4w9WgXcQ";

test("a page is one item whatever its query or anchor say, and only http and https are pages", () => {
  const id = webItemId("https://www.twitch.tv/videos/1?t=10s#chat");
  assert.ok(isItemId(id), id);
  assert.equal(webItemId("https://www.twitch.tv/videos/1"), id);
  assert.notEqual(webItemId("https://www.twitch.tv/videos/2"), id);
  assert.ok(isItemId(VIDEO));
  for (const bad of ["chrome://extensions", "javascript:alert(1)", "file:///C:/x.html", "", null]) {
    assert.equal(webItemId(bad), null, String(bad));
    assert.equal(cleanUrl(bad), null, String(bad));
  }
  for (const bad of ["web:", "web:UPPER", "yt:x", "__proto__", "web:a b"]) {
    assert.equal(isItemId(bad), false, bad);
  }
  assert.equal(siteOf("https://www.twitch.tv/videos/1"), "twitch.tv");
  assert.equal(itemUrl(VIDEO), `https://www.youtube.com/watch?v=${VIDEO}`);
  assert.equal(itemUrl(id), null);
});

test("an item keeps its address and whether it is reading, and the day says how much was reading", () => {
  const comic = { id: "web:comic1", title: " Asterix ", url: "https://example.com/c", kind: "reading" };
  assert.deepEqual(cleanVideo(comic), {
    id: "web:comic1",
    title: "Asterix",
    url: "https://example.com/c",
    kind: "reading",
  });
  assert.deepEqual(cleanVideo({ id: VIDEO, title: "x", url: "javascript:1", kind: "other" }), {
    id: VIDEO,
    title: "x",
  });
  let videos = addVideoSeconds({}, DAY, comic, 300);
  videos = addVideoSeconds(videos, DAY, { id: VIDEO, title: "Video" }, 600);
  // a later report without the address does not lose it
  videos = addVideoSeconds(videos, DAY, { id: "web:comic1", title: "" }, 60);
  assert.deepEqual(dayVideos(videos, DAY)[1], {
    id: "web:comic1",
    title: "Asterix",
    seconds: 360,
    url: "https://example.com/c",
    kind: "reading",
  });
  assert.equal(readingSeconds(videos, DAY), 360);
});

test("the immersion profile is off unless it was turned on, and its script runs everywhere", () => {
  assert.equal(immersionOf(undefined), false);
  assert.equal(immersionOf({ enabled: "yes" }), false);
  assert.equal(immersionOf({ enabled: true }), true);
  const script = immersionScript();
  assert.deepEqual(script.matches, ["<all_urls>"]);
  assert.equal(script.allFrames, true);
});

test("the popup says when it counts because of the immersion profile", () => {
  assert.equal(
    describeStatus({ inTarget: true, playing: true, immersion: true }).text,
    "Counting (immersion profile)",
  );
  assert.equal(describeStatus({ inTarget: true, playing: true }).text, "Counting German");
});

const tab = { id: 7, url: "https://example.com/comic/3?page=2", title: "Asterix  3" };

test("a reading starts on a page, and needs one", () => {
  const session = startManual(tab, 1000);
  assert.deepEqual(session, {
    startedAt: 1000,
    lastFlushed: 1000,
    title: "Asterix 3",
    url: tab.url,
    tabId: 7,
  });
  assert.deepEqual(readManual(session), session);
  assert.equal(startManual({ id: 7, url: "chrome://newtab" }, 1000), null);
  assert.equal(startManual(null, 1000), null);
  assert.equal(readManual({ startedAt: "x" }), null);
  assert.deepEqual(manualItem(session), {
    id: webItemId(tab.url),
    title: "Asterix 3",
    url: tab.url,
    kind: "reading",
  });
});

test("a reading counts every minute until it is stopped", () => {
  const session = startManual(tab, 1000);
  const minute = flushManual(session, 1060);
  assert.deepEqual(minute.interval, { from: 1000, to: 1060 });
  assert.equal(minute.session.lastFlushed, 1060);
  const stop = flushManual(minute.session, 1090, { stop: true });
  assert.deepEqual(stop.interval, { from: 1060, to: 1090 });
  assert.equal(stop.session, null);
  assert.equal(stop.takeBack, 0);
});

test("a computer left alone ends the reading, and the time counted while nobody was there is taken back", () => {
  const session = { ...startManual(tab, 1000), lastFlushed: 1000 + 20 * 60 };
  // 20 minutes counted; nobody since 15 minutes ago, so only the first 5 were reading
  const idle = flushManual(session, 1000 + 20 * 60, { idle: true });
  assert.equal(idle.interval, null);
  assert.equal(idle.takeBack, IDLE_SECONDS);
  assert.equal(idle.session, null);
  // never more than what was counted
  assert.equal(flushManual(startManual(tab, 1000), 1060, { idle: true }).takeBack, 0);
});

test("a reading nobody stopped ends after some hours", () => {
  const session = { ...startManual(tab, 0), lastFlushed: MAX_SESSION_SECONDS - 60 };
  const last = flushManual(session, MAX_SESSION_SECONDS + 3600);
  assert.deepEqual(last.interval, { from: MAX_SESSION_SECONDS - 60, to: MAX_SESSION_SECONDS });
  assert.equal(last.session, null);
});

test("the popup says what the reading is doing", () => {
  assert.equal(describeManual(null, 0).label, "Count reading");
  const running = describeManual(startManual(tab, 1000), 1000 + 125);
  assert.equal(running.label, "Stop reading");
  assert.equal(running.text, "Reading for 2 min: Asterix 3");
});

const ANSWER = {
  days: {
    [DAY]: {
      seconds: 1500,
      readingSeconds: 0,
      devices: { principal: 600, joaquin: 900 },
      items: [
        {
          id: `yt:${VIDEO}`,
          title: "Tagesschau",
          url: null,
          contentKind: "video",
          seconds: 700,
          devices: { principal: 600, joaquin: 100 },
        },
        {
          id: "web:abc123",
          title: "Stream",
          url: "https://www.twitch.tv/videos/1",
          contentKind: "video",
          seconds: 800,
          devices: { joaquin: 800 },
        },
        { id: "nope", title: "bad", seconds: 1, devices: {} },
      ],
    },
    "2025-01-01": {
      seconds: 60,
      devices: { joaquin: 60 },
      items: [{ id: "web:old", seconds: 60, devices: { joaquin: 60 } }],
    },
    bad: { seconds: 5 },
  },
};

test("the answer of Mosaik is kept with only what makes sense, and the items of the recent days", () => {
  const days = cleanDaysAnswer(ANSWER, TODAY);
  assert.deepEqual(Object.keys(days).sort(), ["2025-01-01", DAY]);
  assert.equal(days[DAY].items.length, 2);
  assert.equal(days[DAY].items[0].id, VIDEO);
  assert.deepEqual(days["2025-01-01"].items, []);
  assert.deepEqual(cleanDaysAnswer(null, TODAY), {});
  assert.deepEqual(dayRange(TODAY, 3), { from: "2026-11-16", to: DAY });
});

test("the days show this computer, live, and what Mosaik says of the others", () => {
  const mosaikDays = { fetchedAt: 1, device: "principal", days: cleanDaysAnswer(ANSWER, TODAY) };
  // this computer counted more since Mosaik heard from it: its own time is never taken from Mosaik
  const local = { version: 1, days: { [DAY]: 660 } };
  assert.equal(othersOn(mosaikDays, DAY), 900);
  assert.deepEqual(withOtherDevices(local, mosaikDays).days, { [DAY]: 1560, "2025-01-01": 60 });
  assert.ok(hasOthers(mosaikDays));
  // without knowing which computer this is, nothing of the others can be told apart
  assert.deepEqual(withOtherDevices(local, { ...mosaikDays, device: null }).days, { [DAY]: 660 });
  assert.equal(hasOthers(undefined), false);
});

test("the items of a day are the ones here with what the others add, and the ones only the others have", () => {
  const mosaikDays = { fetchedAt: 1, device: "principal", days: cleanDaysAnswer(ANSWER, TODAY) };
  const local = [{ id: VIDEO, title: "Tagesschau", seconds: 660, url: null, kind: "video" }];
  assert.deepEqual(dayItems(local, mosaikDays, DAY), [
    {
      id: "web:abc123",
      title: "Stream",
      url: "https://www.twitch.tv/videos/1",
      kind: "video",
      seconds: 800,
      here: false,
      elsewhere: ["joaquin"],
    },
    {
      id: VIDEO,
      title: "Tagesschau",
      url: null,
      kind: "video",
      seconds: 760,
      here: true,
      elsewhere: ["joaquin"],
    },
  ]);
  assert.deepEqual(dayItems(local, undefined, DAY), [{ ...local[0], here: true, elsewhere: [] }]);
});
