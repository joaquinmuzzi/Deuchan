import assert from "node:assert/strict";
import { test } from "node:test";

import { logMarker } from "../extension/src/kechimochi-map.js";
import {
  KECHIMOCHI_ALARM,
  createKechimochiRunner,
  readKechimochiSettings,
} from "../extension/src/kechimochi-runner.js";
import { describeKechimochi, kechimochiErrorText } from "../extension/src/kechimochi-status.js";
import { createKechimochiStub } from "./kechimochi-stub.js";

const URL = "http://127.0.0.1:3031";
const ORIGIN = "http://127.0.0.1/*";
const YT = "dQw4w9WgXcQ";
const TODAY = "2026-11-25";

/** A storage like chrome.storage.local, in memory. */
function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  const pick = (keys) => (keys == null ? Object.keys(data) : [].concat(keys));
  return {
    data,
    async get(keys) {
      return Object.fromEntries(
        pick(keys)
          .filter((key) => key in data)
          .map((key) => [key, structuredClone(data[key])]),
      );
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      for (const key of pick(keys)) {
        delete data[key];
      }
    },
  };
}

function fakeAlarms() {
  const created = new Map();
  return {
    created,
    async create(name, info) {
      created.set(name, info);
    },
    async clear(name) {
      return created.delete(name);
    },
    async get(name) {
      return created.get(name);
    },
  };
}

const granted = (origins) => ({
  contains: async ({ origins: asked }) => asked.every((o) => origins.includes(o)),
});

function setUp(initial = {}, { origins = [ORIGIN] } = {}) {
  const stub = createKechimochiStub();
  const storage = memoryStorage({
    targetLanguage: "ja",
    log: { version: 1, days: { "2026-01-01": 3600, [TODAY]: 1500 } },
    videos: {
      [TODAY]: {
        [YT]: { title: "Japanese with Shun", seconds: 1200 },
        "web:abc": { title: "Podcast 1", seconds: 300, url: "https://pod.example/1", kind: "sound" },
      },
    },
    ...initial,
  });
  const alarms = fakeAlarms();
  const runner = createKechimochiRunner({
    storage,
    alarms,
    permissions: granted(origins),
    fetchImpl: stub.fetch,
    now: () => 1_800_000_000_000,
  });
  return { stub, storage, alarms, runner };
}

const summary = (stub) =>
  stub.logs.map((log) => {
    const media = stub.media.find((each) => each.id === log.media_id);
    return `${log.date} ${media.title} [${media.variant}] ${log.duration_minutes} ${log.activity_type}`;
  });

test("the settings are off at Kechimochi's default address until turned on", () => {
  assert.deepEqual(readKechimochiSettings(undefined), { enabled: false, url: URL });
  assert.deepEqual(readKechimochiSettings({ enabled: true, url: "http://8.8.8.8:3031" }), {
    enabled: true,
    url: URL,
  });
});

test("turned on, every day goes to Kechimochi as media entries and logs", async () => {
  const { stub, storage, alarms, runner } = setUp();
  const answer = await runner.enable(URL);
  assert.equal(answer.health.ok, true);
  assert.equal(answer.created, 3);
  assert.ok(alarms.created.has(KECHIMOCHI_ALARM));
  assert.deepEqual(summary(stub), [
    "2026-01-01 Other input [Inputly] 60 Watching",
    `${TODAY} Japanese with Shun [YouTube] 20 Watching`,
    `${TODAY} Podcast 1 [pod.example] 5 Listening`,
  ]);
  assert.deepEqual(
    stub.media.map((media) => [media.language, media.default_activity_type, media.content_type]),
    [
      ["Japanese", "Watching", "Unknown"],
      ["Japanese", "Watching", "Youtube Video"],
      ["Japanese", "Listening", "Audio"],
    ],
  );
  assert.equal(stub.logs[1].notes, logMarker(YT));
  // The old day is sealed: a later correction of it changes nothing there
  assert.equal(storage.data.kechimochiSent["2026-01-01"], true);
  assert.equal(storage.data.kechimochiState.status, "ok");
});

test("nothing is sent twice, today's growth updates its log, and nothing new asks only the version", async () => {
  const { stub, storage, runner } = setUp();
  await runner.enable(URL);
  stub.requests.length = 0;
  assert.deepEqual(await runner.flush(), { ok: true, created: 0, updated: 0, removed: 0, refused: 0 });
  assert.deepEqual(stub.requests, [{ method: "GET", path: "/api/version" }]);

  storage.data.log.days[TODAY] += 600;
  storage.data.videos[TODAY][YT].seconds += 600;
  stub.logs[1].notes += "\nmy own note";
  const answer = await runner.flush();
  assert.equal(answer.updated, 1);
  assert.equal(answer.created, 0);
  assert.equal(stub.logs[1].duration_minutes, 30);
  // What the person wrote in Kechimochi stays
  assert.equal(stub.logs[1].notes, `${logMarker(YT)}\nmy own note`);
  assert.equal(stub.logs.length, 3);
});

test("a video taken out of a day loses its log, and a day corrected down shrinks its logs", async () => {
  const { stub, storage, runner } = setUp();
  await runner.enable(URL);
  // As removeFromDay does: out of the list, and the day corrected to what is left
  delete storage.data.videos[TODAY]["web:abc"];
  storage.data.log.adjust = { [TODAY]: { seconds: -300, at: 1 } };
  const answer = await runner.flush();
  assert.equal(answer.removed, 1);
  assert.deepEqual(summary(stub), [
    "2026-01-01 Other input [Inputly] 60 Watching",
    `${TODAY} Japanese with Shun [YouTube] 20 Watching`,
  ]);

  storage.data.log.adjust = { [TODAY]: { seconds: -900, at: 2 } };
  await runner.flush();
  assert.deepEqual(summary(stub).at(-1), `${TODAY} Japanese with Shun [YouTube] 10 Watching`);
});

test("a log whose answer was lost is found by its marker, not made again", async () => {
  const { stub, storage, runner } = setUp();
  await runner.enable(URL);
  // Inputly forgot what it sent (as if the answers never came back)
  storage.data.kechimochiSent = {};
  stub.logs[1].duration_minutes = 19;
  const answer = await runner.flush();
  assert.equal(answer.created, 0);
  assert.equal(answer.updated, 1);
  assert.equal(stub.logs.length, 3);
  assert.equal(stub.logs[1].duration_minutes, 20);
  assert.equal(storage.data.kechimochiSent[TODAY][YT].log, stub.logs[1].id);
});

test("an existing media entry with the same title and variant is used, not made again", async () => {
  const { stub, runner } = setUp();
  stub.handle({
    method: "POST",
    path: "/api/media",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Japanese with Shun",
      variant: "YouTube",
      default_activity_type: "Watching",
    }),
  });
  await runner.enable(URL);
  assert.equal(stub.media.filter((media) => media.title === "Japanese with Shun").length, 1);
  assert.equal(stub.logs[1].media_id, 1);
});

test("a log deleted in Kechimochi is left deleted", async () => {
  const { stub, storage, runner } = setUp();
  await runner.enable(URL);
  const id = stub.logs[1].id;
  stub.handle({ method: "DELETE", path: `/api/logs/${id}`, headers: { "X-Kechimochi-API": "1" } });
  storage.data.log.days[TODAY] += 600;
  storage.data.videos[TODAY][YT].seconds += 600;
  await runner.flush();
  assert.equal(
    stub.logs.some((log) => log.notes.includes(YT)),
    false,
  );
  assert.deepEqual(storage.data.kechimochiSent[TODAY][YT], { log: null, minutes: 30 });
  storage.data.log.days[TODAY] += 600;
  storage.data.videos[TODAY][YT].seconds += 600;
  await runner.flush();
  assert.equal(
    stub.logs.some((log) => log.notes.includes(YT)),
    false,
  );
});

test("without Kechimochi or the permission nothing is lost: it waits and says why", async () => {
  const { stub, storage, runner } = setUp();
  stub.setDown(true);
  const answer = await runner.enable(URL);
  assert.equal(answer.health.error, "not-running");
  assert.equal(answer.error, "not-running");
  assert.deepEqual(storage.data.kechimochiSent, {});
  assert.equal(storage.data.kechimochiState.status, "not-running");
  stub.setDown(false);
  assert.equal((await runner.flush()).created, 3);

  const missing = setUp({}, { origins: [] });
  assert.deepEqual(await missing.runner.enable(URL), { error: "permission-missing" });
  assert.equal(missing.storage.data.kechimochiSettings, undefined);
  assert.deepEqual(await missing.runner.enable("http://8.8.8.8:3031"), { error: "invalid-url" });
});

test("turned off, the alarm stops and what was sent is forgotten, but the markers keep it from doubling", async () => {
  const { stub, storage, alarms, runner } = setUp();
  await runner.enable(URL);
  await runner.disable();
  assert.equal(alarms.created.has(KECHIMOCHI_ALARM), false);
  assert.equal(storage.data.kechimochiSent, undefined);
  assert.deepEqual(await runner.flush(), { skipped: "off" });
  await runner.enable(URL);
  // Every log is found again by its marker
  assert.equal(stub.logs.length, 3);
});

test("the test says whether Kechimochi answers there", async () => {
  const { runner } = setUp();
  assert.deepEqual(await runner.test(URL), { ok: true, version: "http-0.3.3" });
  assert.deepEqual(await runner.test("http://example.com"), { ok: false, error: "invalid-url" });
});

test("the panel says off, waiting, connected or what went wrong", () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(describeKechimochi({ enabled: false }, {}, now), { tone: "off", text: "Off" });
  assert.equal(describeKechimochi({ enabled: true }, { status: "waiting" }, now).tone, "busy");
  assert.equal(
    describeKechimochi({ enabled: true }, { status: "ok" }, now).text,
    "Connected · nothing new to send",
  );
  assert.equal(
    describeKechimochi({ enabled: true }, { status: "ok", lastSentAt: now - 120_000 }, now).text,
    "Connected · sent 2 min ago",
  );
  assert.deepEqual(describeKechimochi({ enabled: true }, { status: "not-running" }, now), {
    tone: "warn",
    text: kechimochiErrorText("not-running"),
  });
  assert.match(describeKechimochi({ enabled: true }, { status: "forbidden" }, now).text, /LAN mode/);
  assert.equal(
    describeKechimochi({ enabled: true }, { status: "sending", startedAt: now }, now).text,
    "Sending…",
  );
  assert.equal(kechimochiErrorText("http-418"), "Kechimochi answered with an error (418).");
});
