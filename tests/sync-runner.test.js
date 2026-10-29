import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createServer } from "../server/server.js";
import { effectiveLog } from "../extension/src/sync-data.js";
import { PERIODIC_ALARM, SOON_ALARM, createSyncRunner } from "../extension/src/sync-runner.js";

async function withServer(options, body) {
  const dataDir = await mkdtemp(join(tmpdir(), "deuchan-runner-"));
  const app = createServer({ dataDir, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  try {
    await body({ baseUrl: `http://127.0.0.1:${app.server.address().port}`, dataDir });
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** A storage like chrome.storage.local, in memory. */
function memoryStorage(initial = {}) {
  const data = { ...initial };
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

/** Alarms like chrome.alarms: they only remember what was asked. */
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

/** A computer: its own storage and alarms, and a runner on them. */
function computer(baseUrl, days = {}, extra = {}) {
  const storage = memoryStorage({ log: { version: 1, days } });
  const alarms = fakeAlarms();
  const runner = createSyncRunner({ storage, alarms, baseUrl, ...extra });
  return {
    storage,
    alarms,
    runner,
    total: async (day) => {
      const { log, others } = await storage.get(["log", "others"]);
      return effectiveLog(log, others).days[day] ?? 0;
    },
  };
}

test("turning sync on makes a key and a device, syncs, and starts the alarms", async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    const result = await a.runner.create();
    assert.match(result.key, /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(result.ok, true);
    assert.equal(a.storage.data.syncKey, result.key);
    assert.match(a.storage.data.deviceId, /^[0-9a-f-]{36}$/);
    assert.equal(a.storage.data.syncState.status, "ok");
    assert.equal(a.storage.data.syncState.devices, 1);
    assert.equal(a.alarms.created.get(PERIODIC_ALARM).periodInMinutes, 5);
    assert.equal((await readdir(dataDir)).length, 1);
  });
});

test("a second computer joins with the key and the two end with the same total", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    const b = computer(baseUrl, { "2026-10-24": 40, "2026-10-23": 9 });
    const { key } = await a.runner.create();

    const joined = await b.runner.join(key);
    assert.equal(joined.ok, true);
    assert.equal(b.storage.data.syncKey, key);
    assert.equal(b.storage.data.syncState.devices, 2);
    assert.notEqual(b.storage.data.deviceId, a.storage.data.deviceId);

    await a.runner.run();
    assert.equal(await a.total("2026-10-24"), 140);
    assert.equal(await b.total("2026-10-24"), 140);
    assert.equal(await a.total("2026-10-23"), 9);
  });
});

test("the key can be typed in lower case, with spaces, or with the letters that look like digits", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 1 });
    const b = computer(baseUrl);
    const { key } = await a.runner.create();
    const sloppy = `  ${key.toLowerCase().replaceAll("-", " ")} `;
    const joined = await b.runner.join(sloppy);
    assert.equal(joined.ok, true);
    assert.equal(b.storage.data.syncKey, key, "and it is kept the standard way");
  });
});

test("a key that is not one leaves nothing behind", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const b = computer(baseUrl);
    assert.deepEqual(await b.runner.join("this is not a key"), { error: "invalid-key" });
    assert.equal(b.storage.data.syncKey, undefined);
    assert.equal(b.storage.data.syncState, undefined);
    assert.equal(b.alarms.created.size, 0);
  });
});

test("a key with no data on the server (a typing mistake) leaves nothing behind and creates nothing", async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const b = computer(baseUrl, { "2026-10-24": 5 });
    const result = await b.runner.join("0000-0000-0000-0000-0000-0000-0000-0001");
    assert.deepEqual(result, { error: "no-data" });
    assert.equal(b.storage.data.syncKey, undefined);
    assert.equal(b.storage.data.syncState, undefined);
    assert.equal(b.alarms.created.size, 0);
    assert.deepEqual(await readdir(dataDir), [], "no empty copy was started");
  });
});

test("a round with sync off does nothing", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl);
    assert.deepEqual(await a.runner.run(), { skipped: "off" });
  });
});

test("turning sync off removes the key, the state and the alarms, and keeps the time", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    const b = computer(baseUrl, { "2026-10-24": 40 });
    const { key } = await a.runner.create();
    await b.runner.join(key);
    await a.runner.run();
    await a.runner.disable();
    assert.equal(a.storage.data.syncKey, undefined);
    assert.equal(a.storage.data.syncState, undefined);
    assert.equal(a.alarms.created.size, 0);
    assert.equal(await a.total("2026-10-24"), 140, "what was synced is still shown");
    assert.deepEqual(await a.runner.run(), { skipped: "off" });
  });
});

test("erasing deletes the copy on the server and then turns sync off", async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    await a.runner.create();
    assert.equal((await readdir(dataDir)).length, 1);
    assert.deepEqual(await a.runner.erase(), {});
    assert.deepEqual(await readdir(dataDir), []);
    assert.equal(a.storage.data.syncKey, undefined);
    assert.equal(await a.total("2026-10-24"), 100);
  });
});

test("if the server cannot be reached, erasing changes nothing and says why", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    const { key } = await a.runner.create();
    const lost = computer(
      "http://127.0.0.1:1",
      { "2026-10-24": 100 },
      { fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(500) }) },
    );
    await lost.storage.set({ syncKey: key });
    assert.deepEqual(await lost.runner.erase(), { error: "network" });
    assert.equal(lost.storage.data.syncKey, key, "the key is still there to try again");
  });
});

test("a server that is down is an error in the state, the key stays, and the next round recovers", async () => {
  await withServer({}, async ({ baseUrl }) => {
    let up = true;
    const flaky = (url, init) => (up ? fetch(url, init) : Promise.reject(new Error("down")));
    const a = computer(baseUrl, { "2026-10-24": 100 }, { fetchImpl: flaky });
    await a.runner.create();
    up = false;
    assert.deepEqual(await a.runner.run(), { error: "network" });
    assert.equal(a.storage.data.syncState.status, "error");
    assert.equal(a.storage.data.syncState.error, "network");
    assert.match(
      a.storage.data.syncState.detail,
      /could not be reached/,
      "and it says what happened, for the hint",
    );
    assert.equal(a.storage.data.syncState.lastSync > 0, true, "it remembers the last good sync");
    assert.ok(a.storage.data.syncKey);
    up = true;
    assert.equal((await a.runner.run()).ok, true);
    assert.equal(a.storage.data.syncState.status, "ok");
    assert.equal(a.storage.data.syncState.error, null);
    assert.equal(a.storage.data.syncState.detail, null, "and the hint goes away");
  });
});

test("when the server says too many requests, automatic rounds wait and a person asking does not", async () => {
  // The server and the computer share one clock, so that the minute the server counts can pass
  let time = 1_000_000;
  await withServer({ perMinutePerToken: 2, now: () => time }, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 }, { now: () => time });
    await a.runner.create(); // a get and a put: two requests
    assert.deepEqual(await a.runner.run(), { error: "rate-limited" });
    assert.equal(a.storage.data.syncState.retryAt, time + 60_000);

    // an alarm during the wait does not even ask the server
    assert.deepEqual(await a.runner.run(), { skipped: "waiting" });
    await a.runner.onAlarm(PERIODIC_ALARM);
    assert.equal(a.storage.data.syncState.retryAt, time + 60_000);

    // a person who presses "Sync now" is not made to wait
    time += 61_000;
    assert.equal((await a.runner.run({ manual: true })).ok, true);
    assert.equal(a.storage.data.syncState.retryAt, null);
  });
});

test("soon asks for one alarm, not one for every change, and only with sync on", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 1 });
    await a.runner.soon();
    assert.equal(a.alarms.created.has(SOON_ALARM), false, "with sync off there is nothing to do");
    await a.runner.create();
    await a.runner.soon();
    assert.equal(a.alarms.created.get(SOON_ALARM).delayInMinutes, 1);
    a.alarms.created.get(SOON_ALARM).marker = "first";
    await a.runner.soon();
    assert.equal(a.alarms.created.get(SOON_ALARM).marker, "first", "it was not asked again");
  });
});

test("the alarms start a round, and other alarms do not", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    await a.runner.create();
    const before = a.storage.data.syncState.lastSync;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await a.runner.onAlarm("something-else");
    assert.equal(a.storage.data.syncState.lastSync, before);
    await a.runner.onAlarm(SOON_ALARM);
    assert.ok(a.storage.data.syncState.lastSync >= before);
  });
});

test("schedule makes the alarms match the settings after the extension starts again", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 1 });
    await a.runner.create();
    a.alarms.created.clear(); // the browser forgot them
    await a.runner.schedule();
    assert.ok(a.alarms.created.has(PERIODIC_ALARM));
    await a.storage.remove("syncKey");
    await a.runner.schedule();
    assert.equal(a.alarms.created.size, 0);
  });
});

test("rounds run one after the other even if asked together", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl, { "2026-10-24": 100 });
    await a.runner.create();
    const results = await Promise.all([a.runner.run(), a.runner.run(), a.runner.run()]);
    assert.ok(results.every((result) => result.ok));
    assert.equal(a.storage.data.syncState.status, "ok");
  });
});

test("the device id is made once and kept", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const a = computer(baseUrl);
    const first = await a.runner.ensureDeviceId();
    assert.equal(await a.runner.ensureDeviceId(), first);
    assert.equal(a.storage.data.deviceId, first);
  });
});
