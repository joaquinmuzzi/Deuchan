import assert from "node:assert/strict";
import { test } from "node:test";

import { correctDay } from "../extension/src/corrections.js";
import { migrate } from "../extension/src/log.js";
import { JOIN_GAP_MS, readOutbox } from "../extension/src/mosaik-events.js";
import {
  BATCH_SIZE,
  MOSAIK_ALARM,
  createMosaikRunner,
  queueRemoval,
  queueWatched,
  readMosaikSettings,
} from "../extension/src/mosaik-runner.js";
import { effectiveLog } from "../extension/src/sync-data.js";
import { batchProblems } from "./mosaik-contract.js";

const URL = "http://127.0.0.1:7300";
const ORIGIN = "http://127.0.0.1/*";
const DAY = "2026-11-14";
const VIDEO = { id: "dQw4w9WgXcQ", title: "Easy German 500" };
const START = 1_794_670_000; // seconds

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

function fakePermissions(granted = [ORIGIN]) {
  const origins = new Set(granted);
  return {
    origins,
    async contains(request) {
      return request.origins.every((origin) => origins.has(origin));
    },
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status });

/**
 * Mosaik as the contract describes it: it keeps every event once, says which ids it had already, and
 * can be down, answer with an error, refuse big batches, refuse some events, or wait before answering.
 */
function fakeHub() {
  const hub = {
    down: false,
    status: null,
    maxBatch: Infinity,
    reject: () => null,
    gate: null,
    batches: [],
    kept: new Map(),
    requests: 0,
  };
  hub.fetchImpl = async (url, init) => {
    hub.requests += 1;
    if (hub.down) {
      throw new TypeError("Failed to fetch");
    }
    if (url.endsWith("/api/health")) {
      return json(200, { status: "ok", name: "mosaik", version: "0.3.0", schemaVersion: 1, now: 1 });
    }
    if (hub.status) {
      return json(hub.status, { error: `answered ${hub.status}` });
    }
    const { events } = JSON.parse(init.body);
    if (events.length > hub.maxBatch) {
      return json(413, { error: "too large" });
    }
    await hub.gate;
    hub.batches.push(events);
    let accepted = 0;
    let duplicates = 0;
    const rejected = [];
    events.forEach((event, index) => {
      const reason = hub.reject(event);
      if (reason) {
        rejected.push({ index, id: event.id, error: reason });
      } else if (hub.kept.has(event.id)) {
        duplicates += 1;
      } else {
        accepted += 1;
        hub.kept.set(event.id, event);
      }
    });
    return json(200, { accepted, duplicates, rejected });
  };
  hub.totals = () => {
    // what the hub keeps of each day: the total with the newest moment
    const totals = {};
    for (const event of hub.kept.values()) {
      if (event.kind === "day_total" && (totals[event.day]?.at ?? 0) < event.at) {
        totals[event.day] = event;
      }
    }
    return Object.fromEntries(Object.entries(totals).map(([day, event]) => [day, event.seconds]));
  };
  return hub;
}

/** Runs tasks one after the other, as the queue of the background script does. */
function serializer() {
  let queue = Promise.resolve();
  return (task) => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
}

/** A computer with Deuchan: storage, alarms, permissions, a clock and a runner, and a hub to talk to. */
function computer({ days = { [DAY]: 0 }, enabled = false, granted = [ORIGIN], hub = fakeHub(), clock } = {}) {
  const storage = memoryStorage({
    log: { version: 1, days },
    ...(enabled ? { mosaikSettings: { enabled: true, url: URL }, mosaikBackfilledAt: 1 } : {}),
  });
  const alarms = fakeAlarms();
  const permissions = fakePermissions(granted);
  const exclusive = serializer();
  const time = clock ?? { now: START * 1000 + 60_000 };
  let uuid = 0;
  const runner = createMosaikRunner({
    storage,
    alarms,
    permissions,
    exclusive,
    fetchImpl: hub.fetchImpl,
    now: () => time.now,
  });

  /** What the background script does when a tab reports: the log and the queue in one write. */
  const save = (intervals, video = VIDEO) =>
    exclusive(async () => {
      const stored = await storage.get(["log", "mosaikSettings", "mosaikOutbox"]);
      const log = migrate(stored.log);
      const counted = [];
      for (const interval of intervals) {
        const newSeconds = interval.to - interval.from;
        log.days[DAY] = (log.days[DAY] ?? 0) + newSeconds;
        counted.push({ interval, newSeconds });
      }
      const outbox = queueWatched(stored, counted, video, () => `uuid-${(uuid += 1)}`);
      await storage.set({ log, ...(outbox ? { mosaikOutbox: outbox } : {}) });
    });

  /** A video that plays without a break, from `from` (seconds), for `count` reports of two seconds. */
  const watch = async (from, count, video) => {
    for (let index = 0; index < count; index += 1) {
      await save([{ from: from + index * 2, to: from + index * 2 + 2 }], video);
    }
  };

  const outbox = async () => readOutbox((await storage.get("mosaikOutbox")).mosaikOutbox);
  const state = async () => (await storage.get("mosaikState")).mosaikState ?? {};
  const shown = async () => {
    const { log, others } = await storage.get(["log", "others"]);
    return effectiveLog(migrate(log), others).days;
  };
  return { storage, alarms, permissions, exclusive, runner, hub, time, save, watch, outbox, state, shown };
}

test("it is off by default, at the default address", () => {
  assert.deepEqual(readMosaikSettings(undefined), { enabled: false, url: URL });
  assert.deepEqual(readMosaikSettings({ enabled: "yes", url: "http://example.com" }), {
    enabled: false,
    url: URL,
  });
});

test("off, nothing is kept and nothing is sent", async () => {
  const pc = computer({ days: { [DAY]: 600 } });
  await pc.watch(START, 10);
  assert.equal(pc.storage.data.mosaikOutbox, undefined);
  assert.deepEqual(await pc.runner.flush(), { skipped: "off" });
  await pc.runner.schedule();
  await pc.runner.onAlarm(MOSAIK_ALARM);
  assert.equal(pc.hub.requests, 0);
  assert.equal(pc.alarms.created.size, 0);
  assert.equal(queueRemoval({}, DAY, VIDEO.id, 1), null);
});

test("turning it on needs the permission, and without it stays off", async () => {
  const pc = computer({ granted: [] });
  assert.deepEqual(await pc.runner.enable(URL), { error: "permission-missing" });
  assert.equal(readMosaikSettings(pc.storage.data.mosaikSettings).enabled, false);
  assert.deepEqual(await pc.runner.enable("http://example.com:7300"), { error: "invalid-url" });
  assert.equal(pc.hub.requests, 0);
});

test("turned on the first time, it sends the history and keeps sending every minute", async () => {
  const pc = computer({ days: { "2026-11-01": 300, "2026-11-13": 1200, [DAY]: 60 } });
  pc.storage.data.videos = { [DAY]: { [VIDEO.id]: { title: VIDEO.title, seconds: 60 } } };
  const result = await pc.runner.enable(" http://127.0.0.1:7300/ ");
  assert.equal(result.health.version, "0.3.0");
  assert.equal(result.queued, 3);
  assert.deepEqual(pc.hub.totals(), { "2026-11-01": 300, "2026-11-13": 1200, [DAY]: 60 });
  assert.equal([...pc.hub.kept.values()].find((event) => event.day === DAY).videos[0].videoId, VIDEO.id);
  assert.deepEqual(pc.alarms.created.get(MOSAIK_ALARM), { delayInMinutes: 1, periodInMinutes: 1 });
  assert.equal(pc.storage.data.mosaikBackfilledAt, pc.time.now);
  assert.equal((await pc.state()).status, "ok");

  // turned off and on again, the days go as they are then, with new ids; the history was already sent
  const backfilledAt = pc.time.now;
  await pc.runner.disable();
  pc.time.now += 60_000;
  const before = pc.hub.kept.size;
  await pc.runner.enable(URL);
  assert.equal(pc.hub.kept.size, before + 3);
  assert.equal(pc.storage.data.mosaikBackfilledAt, backfilledAt);
});

test("watch intervals go once closed, joined while the video plays", async () => {
  const pc = computer({ enabled: true });
  await pc.watch(START, 30); // a minute of the same video
  await pc.runner.flush();
  assert.deepEqual(
    [...pc.hub.kept.values()].map((event) => event.kind),
    ["day_total"],
    "the open interval waits",
  );
  pc.time.now = (START + 60) * 1000 + JOIN_GAP_MS + 1;
  await pc.runner.flush();
  const intervals = [...pc.hub.kept.values()].filter((event) => event.kind === "watch_interval");
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].seconds, 60);
  assert.equal(intervals[0].from, START * 1000);
  assert.equal((await pc.outbox()).queued.length, 0);
});

test("with Mosaik off the events wait, and go by themselves when it is back", async () => {
  const hub = fakeHub();
  hub.down = true;
  const pc = computer({ enabled: true, hub });
  await pc.watch(START, 5);
  pc.time.now = (START + 100) * 1000;
  assert.deepEqual(await pc.runner.flush(), { error: "not-running", sent: 0 });
  const waiting = await pc.state();
  assert.equal(waiting.status, "not-running");
  assert.equal(waiting.pending, 2, "the interval and the total of the day");

  hub.down = false;
  await pc.runner.onAlarm(MOSAIK_ALARM);
  assert.equal(hub.kept.size, 2);
  assert.equal((await pc.state()).pending, 0);
  assert.equal((await pc.state()).status, "ok");
  assert.equal((await pc.state()).lastSentAt, pc.time.now);
});

test("only a day whose total changed gets a new total, and it matches the dashboard", async () => {
  const pc = computer({ enabled: true, days: { "2026-11-13": 900, [DAY]: 120 } });
  await pc.runner.flush();
  const first = pc.hub.kept.size;
  await pc.runner.flush();
  assert.equal(pc.hub.kept.size, first, "nothing changed, nothing new");

  // the person corrects yesterday on the dashboard, and another computer adds time to today
  const stored = await pc.storage.get(["log", "others"]);
  const log = correctDay(migrate(stored.log), stored.others, "2026-11-13", 600, pc.time.now);
  const others = { "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": { days: { [DAY]: 300.6 } } };
  await pc.storage.set({ log, others });
  pc.time.now += 60_000;
  await pc.runner.flush();
  const shown = await pc.shown();
  assert.deepEqual(pc.hub.totals(), { "2026-11-13": 600, [DAY]: Math.floor(shown[DAY]) });
  assert.equal(pc.hub.totals()[DAY], 420);
  assert.equal(pc.hub.kept.size, first + 2, "one new total for each of the two days, with its own id");
});

test("a day corrected to zero is sent as zero", async () => {
  const pc = computer({ enabled: true, days: { "2026-11-13": 900 } });
  await pc.runner.flush();
  const stored = await pc.storage.get(["log"]);
  await pc.storage.set({ log: correctDay(migrate(stored.log), {}, "2026-11-13", 0, pc.time.now) });
  pc.time.now += 1000;
  await pc.runner.flush();
  assert.deepEqual(pc.hub.totals(), { "2026-11-13": 0 });
});

test("a removed video becomes an event", async () => {
  const pc = computer({ enabled: true });
  const stored = await pc.storage.get(["mosaikSettings", "mosaikOutbox"]);
  await pc.storage.set({ mosaikOutbox: queueRemoval(stored, DAY, VIDEO.id, 1_794_670_420_000) });
  await pc.runner.flush();
  assert.ok(pc.hub.kept.has(`deuchan:rm:${DAY}:${VIDEO.id}:1794670420000`));
});

test("events the hub already had or refused leave the queue, and the refusals are counted", async () => {
  const hub = fakeHub();
  hub.reject = (event) => (event.kind === "day_total" && event.day === "2026-11-01" ? "day too old" : null);
  const pc = computer({ enabled: true, hub, days: { "2026-11-01": 60, [DAY]: 60 } });
  // the hub already has the total of today: a second sending of the same ids is safe
  await pc.runner.flush();
  const again = readOutbox({ queued: [...hub.kept.values()] });
  await pc.storage.set({ mosaikOutbox: again });
  await pc.runner.flush();
  const state = await pc.state();
  assert.equal((await pc.outbox()).queued.length, 0);
  assert.equal(state.rejected, 1);
  assert.match(state.lastRejected, /day too old/);
  assert.equal(state.status, "ok");
});

test("404 keeps the events and says Mosaik has to be updated; 5xx keeps them to try again", async () => {
  const hub = fakeHub();
  const pc = computer({ enabled: true, hub, days: { [DAY]: 60 } });
  hub.status = 404;
  assert.deepEqual(await pc.runner.flush(), { error: "outdated", sent: 0 });
  assert.equal((await pc.state()).status, "outdated");
  assert.equal((await pc.outbox()).queued.length, 1);
  hub.status = 503;
  await pc.runner.flush();
  assert.equal((await pc.state()).status, "error");
  assert.equal((await pc.state()).lastError, "server");
  for (const [status, expected] of [
    [403, "forbidden"],
    [400, "bad-request"],
  ]) {
    hub.status = status;
    await pc.runner.flush();
    assert.equal((await pc.state()).status, expected);
    assert.equal((await pc.state()).lastError, `answered ${status}`);
  }
  assert.equal((await pc.outbox()).queued.length, 1);
  hub.status = null;
  await pc.runner.flush();
  assert.equal((await pc.outbox()).queued.length, 0);
  assert.equal((await pc.state()).lastError, null);
});

test("413 sends the batch again in halves until it fits", async () => {
  const hub = fakeHub();
  hub.maxBatch = 30;
  const days = {};
  for (let index = 0; index < 120; index += 1) {
    days[`2026-07-${String((index % 31) + 1).padStart(2, "0")}`] = 60;
    days[`2026-0${(index % 5) + 3}-${String((index % 28) + 1).padStart(2, "0")}`] = 60;
  }
  const pc = computer({ enabled: true, hub, days });
  await pc.runner.flush();
  assert.equal((await pc.outbox()).queued.length, 0);
  assert.equal(hub.kept.size, Object.keys(days).length);
  assert.ok(hub.batches.every((batch) => batch.length <= 30));
  assert.ok(BATCH_SIZE <= 500);
});

test("without the permission nothing is sent, and the panel is told", async () => {
  const pc = computer({ enabled: true, granted: [], days: { [DAY]: 60 } });
  assert.deepEqual(await pc.runner.flush(), { error: "permission-missing" });
  assert.equal((await pc.state()).status, "permission-missing");
  assert.equal(pc.hub.requests, 0);
});

test("time counted while a batch is on its way is not lost", async () => {
  const hub = fakeHub();
  let open;
  hub.gate = new Promise((resolve) => {
    open = resolve;
  });
  const pc = computer({ enabled: true, hub, days: { [DAY]: 60 } });
  const flushing = pc.runner.flush();
  // the hub is still answering: a tab reports, and a removed video is queued
  await new Promise((resolve) => setTimeout(resolve, 20));
  await pc.watch(START, 3);
  await pc.exclusive(async () => {
    const stored = await pc.storage.get(["mosaikSettings", "mosaikOutbox"]);
    await pc.storage.set({ mosaikOutbox: queueRemoval(stored, DAY, VIDEO.id, 5) });
  });
  open();
  await flushing;
  const outbox = await pc.outbox();
  assert.equal(outbox.open?.seconds, 6, "the open interval is still there");
  assert.deepEqual(outbox.queued, []);
  // the first batch had only the total of the day; what arrived meanwhile went in the next one
  assert.deepEqual(
    hub.batches.map((batch) => batch.map((event) => event.kind)),
    [["day_total"], ["video_removed"]],
  );
});

test("turning it off stops the alarm, empties the queue and stops keeping events", async () => {
  const hub = fakeHub();
  hub.down = true;
  const pc = computer({ enabled: true, hub, days: { [DAY]: 60 } });
  await pc.runner.schedule();
  await pc.watch(START, 3);
  await pc.runner.flush();
  await pc.runner.disable();
  assert.equal(pc.alarms.created.size, 0);
  assert.equal(pc.storage.data.mosaikOutbox, undefined);
  assert.equal(pc.storage.data.mosaikSentDays, undefined);
  assert.deepEqual(pc.storage.data.mosaikState, { status: "off" });
  assert.equal(pc.storage.data.mosaikSettings.url, URL, "the address is remembered");
  await pc.watch(START + 100, 3);
  assert.equal(pc.storage.data.mosaikOutbox, undefined);
});

test("the history can be sent again whenever the person wants", async () => {
  const pc = computer({ enabled: true, days: { "2026-11-13": 60, [DAY]: 60 } });
  await pc.runner.flush();
  pc.time.now += 1000;
  const result = await pc.runner.backfill();
  assert.equal(result.queued, 2);
  assert.equal(pc.hub.kept.size, 4, "new ids for the same days");
  assert.deepEqual(await computer().runner.backfill(), { error: "off" });
});

test("the test of the connection gives the version of Mosaik, or why not", async () => {
  const pc = computer();
  assert.deepEqual(await pc.runner.test(URL), { ok: true, version: "0.3.0", schemaVersion: 1 });
  assert.equal((await pc.state()).hubVersion, "0.3.0");
  assert.deepEqual(await pc.runner.test("http://192.168.1.2:7300"), { ok: false, error: "invalid-url" });
  assert.deepEqual(await computer({ granted: [] }).runner.test(URL), {
    ok: false,
    error: "permission-missing",
  });
  const down = fakeHub();
  down.down = true;
  assert.deepEqual(await computer({ hub: down }).runner.test(URL), { ok: false, error: "not-running" });
});

test("everything the extension sends follows the contract of Mosaik", async () => {
  const pc = computer({ days: { "2026-10-01": 300, "2026-11-13": 1200, [DAY]: 0 } });
  pc.storage.data.videos = { "2026-11-13": { [VIDEO.id]: { title: VIDEO.title, seconds: 1200 } } };
  await pc.runner.enable(URL);
  await pc.watch(START, 400);
  await pc.watch(START + 900, 5, { id: "9bVfoZu-aH4", title: "Nicos Weg" });
  const stored = await pc.storage.get(["mosaikSettings", "mosaikOutbox"]);
  await pc.storage.set({ mosaikOutbox: queueRemoval(stored, DAY, VIDEO.id, pc.time.now) });
  pc.time.now = (START + 2000) * 1000;
  await pc.runner.flush();
  assert.ok(pc.hub.batches.length >= 2);
  for (const batch of pc.hub.batches) {
    assert.deepEqual(batchProblems({ events: batch }), []);
  }
  const kinds = new Set([...pc.hub.kept.values()].map((event) => event.kind));
  assert.deepEqual([...kinds].sort(), ["day_total", "video_removed", "watch_interval"]);
});
