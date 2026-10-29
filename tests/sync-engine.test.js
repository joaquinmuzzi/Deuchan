import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createServer } from "../server/server.js";
import { SyncError, createClient } from "../extension/src/sync-client.js";
import { deriveKeys, newSyncKey, parseSyncKey } from "../extension/src/sync-crypto.js";
import { syncOnce } from "../extension/src/sync-engine.js";
import { effectiveLog, newDeviceId } from "../extension/src/sync-data.js";

/** Starts a real server on a free port, runs `body` with its address, and cleans up. */
async function withServer(options, body) {
  const dataDir = await mkdtemp(join(tmpdir(), "deuchan-engine-"));
  const app = createServer({ dataDir, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  try {
    await body({ baseUrl, dataDir, app });
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** A person with a sync key; each computer of theirs is a `device`. */
async function person(baseUrl) {
  const keys = await deriveKeys(parseSyncKey(newSyncKey()));
  return {
    keys,
    device: (days = {}) => ({
      deviceId: newDeviceId(),
      log: { version: 1, days },
      others: {},
      client: createClient({ baseUrl, token: keys.token }),
    }),
  };
}

/** One round of sync for a device, keeping what it learned. */
async function sync(device, keys, extra = {}) {
  const result = await syncOnce({
    client: device.client,
    key: keys.key,
    deviceId: device.deviceId,
    log: device.log,
    others: device.others,
    ...extra,
  });
  device.others = result.others;
  return result;
}

const total = (device, day) => effectiveLog(device.log, device.others).days[day] ?? 0;

test("the first round creates the block, and the server only holds it encrypted", async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const { keys, device } = await person(baseUrl);
    const first = device({ "2026-10-24": 3600 });
    const result = await sync(first, keys);
    assert.equal(result.uploaded, true);
    assert.equal(result.devices, 1);

    const files = await readdir(dataDir);
    assert.equal(files.length, 1);
    const stored = await readFile(join(dataDir, files[0]), "utf8");
    assert.ok(!stored.includes("2026-10-24"), "the day is not there");
    assert.ok(!stored.includes(first.deviceId), "the device is not there");
    assert.ok(!stored.includes("3600"), "the seconds are not there");
  });
});

test("two computers end with the same total, and syncing again and again never counts twice", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 100 });
    const b = device({ "2026-10-24": 40, "2026-10-23": 9 });
    for (let round = 0; round < 4; round += 1) {
      await sync(a, keys);
      await sync(b, keys);
    }
    assert.equal(total(a, "2026-10-24"), 140);
    assert.equal(total(b, "2026-10-24"), 140);
    assert.equal(total(a, "2026-10-23"), 9);
    assert.equal(total(b, "2026-10-23"), 9);
  });
});

test("a round with nothing new writes nothing, so the server's revision stays and no request is wasted", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 100 });
    assert.equal((await sync(a, keys)).uploaded, true);
    assert.equal((await sync(a, keys)).uploaded, false);
    assert.equal((await a.client.get()).rev, 1);

    // a second computer joins: it has something new, then it does not
    const b = device({ "2026-10-24": 40 });
    assert.equal((await sync(b, keys)).uploaded, true);
    assert.equal((await sync(b, keys)).uploaded, false);
    assert.equal(
      (await sync(a, keys)).uploaded,
      false,
      "A already has what B sent, and B has A's: the server too",
    );
  });
});

test("time counted after a round is carried by the next one", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 100 });
    const b = device({});
    await sync(a, keys);
    await sync(b, keys);
    a.log = { version: 1, days: { "2026-10-24": 160, "2026-10-25": 30 } }; // A watched more
    await sync(a, keys);
    await sync(b, keys);
    assert.equal(total(b, "2026-10-24"), 160);
    assert.equal(total(b, "2026-10-25"), 30);
  });
});

test("a third computer gets what the first two counted", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 100 });
    const b = device({ "2026-10-24": 40 });
    await sync(a, keys);
    await sync(b, keys);
    const c = device({});
    await sync(c, keys, { mustExist: true });
    assert.equal(total(c, "2026-10-24"), 140);
  });
});

test("two computers syncing at the same moment both end up with everything", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 100 });
    const b = device({ "2026-10-24": 40 });
    // The first write of each says "I saw nothing": one of them gets a conflict and must start again
    const results = await Promise.all([sync(a, keys), sync(b, keys)]);
    assert.ok(results.every((result) => result.uploaded || result.devices === 2));
    await sync(a, keys);
    await sync(b, keys);
    assert.equal(total(a, "2026-10-24"), 140);
    assert.equal(total(b, "2026-10-24"), 140);
  });
});

test("a person with another key has another copy: they never see each other", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const alice = await person(baseUrl);
    const bob = await person(baseUrl);
    const a = alice.device({ "2026-10-24": 100 });
    const b = bob.device({ "2026-10-24": 7 });
    await sync(a, alice.keys);
    await sync(b, bob.keys);
    assert.equal(total(a, "2026-10-24"), 100);
    assert.equal(total(b, "2026-10-24"), 7);
  });
});

test("joining with a key that has no data is an error, not a silent empty copy", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    await assert.rejects(
      () => sync(device(), keys, { mustExist: true }),
      (error) => error instanceof SyncError && error.kind === "no-data",
    );
    // and nothing was created on the server
    assert.equal(await device().client.get(), null);
  });
});

test("data on the server that was changed, or made with another key, is refused as corrupt", async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 100 });
    await sync(a, keys);
    const [file] = await readdir(dataDir);
    const record = JSON.parse(await readFile(join(dataDir, file), "utf8"));
    record.block.data = `${record.block.data.slice(0, -2)}AA`;
    await writeFile(join(dataDir, file), JSON.stringify(record));
    await assert.rejects(
      () => sync(a, keys),
      (error) => error instanceof SyncError && error.kind === "corrupt",
    );
  });
});

test("a server that cannot be reached is a network error", async () => {
  const keys = await deriveKeys(parseSyncKey(newSyncKey()));
  const client = createClient({ baseUrl: "http://127.0.0.1:1", token: keys.token, timeoutMs: 2000 });
  await assert.rejects(
    () => syncOnce({ client, key: keys.key, deviceId: newDeviceId(), log: { days: {} }, others: {} }),
    (error) => error instanceof SyncError && error.kind === "network",
  );
});

test("a server that is too slow is a network error too", async () => {
  const keys = await deriveKeys(parseSyncKey(newSyncKey()));
  const slow = (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const client = createClient({
    baseUrl: "http://example.invalid",
    token: keys.token,
    fetchImpl: slow,
    timeoutMs: 50,
  });
  await assert.rejects(
    () => client.get(),
    (error) => error instanceof SyncError && error.kind === "network",
  );
});

test("too many requests is a rate-limited error that says how long to wait", async () => {
  await withServer({ perMinutePerToken: 2 }, async ({ baseUrl }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 1 });
    await sync(a, keys); // a get and a put: two requests
    await assert.rejects(
      () => sync(a, keys),
      (error) => error instanceof SyncError && error.kind === "rate-limited" && error.retryAfter === 60,
    );
  });
});

test("a malformed key is turned away by the server as an auth error", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const client = createClient({ baseUrl, token: "not-a-token" });
    await assert.rejects(
      () => client.get(),
      (error) => error instanceof SyncError && error.kind === "auth",
    );
  });
});

test("a full server is a full error, and the person's existing copy still syncs", async () => {
  await withServer({ maxBlobs: 1 }, async ({ baseUrl }) => {
    const first = await person(baseUrl);
    const second = await person(baseUrl);
    const a = first.device({ "2026-10-24": 1 });
    await sync(a, first.keys);
    await assert.rejects(
      () => sync(second.device({ "2026-10-24": 2 }), second.keys),
      (error) => error instanceof SyncError && error.kind === "full",
    );
    a.log = { version: 1, days: { "2026-10-24": 5 } };
    assert.equal((await sync(a, first.keys)).uploaded, true);
  });
});

test("the person can delete their data from the server", async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const { keys, device } = await person(baseUrl);
    const a = device({ "2026-10-24": 1 });
    await sync(a, keys);
    await a.client.remove();
    assert.equal(await a.client.get(), null);
    assert.deepEqual(await readdir(dataDir), []);
    await a.client.remove(); // twice is fine
  });
});

test("if the data keeps changing underneath, the round gives up with a conflict instead of looping", async () => {
  const keys = await deriveKeys(parseSyncKey(newSyncKey()));
  let puts = 0;
  const client = {
    get: async () => null,
    put: async () => {
      puts += 1;
      return { conflict: true };
    },
  };
  await assert.rejects(
    () =>
      syncOnce({
        client,
        key: keys.key,
        deviceId: newDeviceId(),
        log: { days: { "2026-10-24": 1 } },
        others: {},
      }),
    (error) => error instanceof SyncError && error.kind === "conflict",
  );
  assert.equal(puts, 3);
});

test("what the server says is checked: an answer with no revision, or that is not json, is invalid", async () => {
  const keys = await deriveKeys(parseSyncKey(newSyncKey()));
  const answer = (init) => async () => new Response(init.body, init);
  const noRevision = createClient({
    baseUrl: "http://x",
    token: keys.token,
    fetchImpl: answer({ status: 200, body: "{}" }),
  });
  const notJson = createClient({
    baseUrl: "http://x",
    token: keys.token,
    fetchImpl: answer({ status: 200, headers: { ETag: '"1"' }, body: "<html>" }),
  });
  for (const client of [noRevision, notJson]) {
    await assert.rejects(
      () => client.get(),
      (error) => error instanceof SyncError && error.kind === "invalid",
    );
  }
});
