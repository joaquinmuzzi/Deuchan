import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createServer } from "../server/server.js";

const TOKEN = "A".repeat(43);
const OTHER_TOKEN = "B".repeat(43);
const BLOCK = { v: 1, iv: "abc_DEF-123", data: "c2VjcmV0LWRhdGE" };

/** Starts a server on a free port with its own folder, runs `body`, and cleans up. */
async function withServer(options, body) {
  const dataDir = await mkdtemp(join(tmpdir(), "deuchan-sync-"));
  const app = createServer({ dataDir, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    await body({ app, base, dataDir });
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

const request = (base, method, { token = TOKEN, headers = {}, body, path = "/v1/blob" } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const put = (base, ifMatch, body = BLOCK, extra = {}) =>
  request(base, "PUT", { body, headers: { "If-Match": ifMatch }, ...extra });

test("the health check answers without a key", async () => {
  await withServer({}, async ({ base }) => {
    const response = await request(base, "GET", { path: "/healthz", token: null });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test("a request with no key, or a key that is not one, is turned away", async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await request(base, "GET", { token: null })).status, 401);
    assert.equal((await request(base, "GET", { token: "short" })).status, 401);
    assert.equal((await request(base, "GET", { token: `${"A".repeat(42)}!` })).status, 401);
    assert.equal(
      (await request(base, "GET", { headers: { Authorization: "Basic abc" }, token: null })).status,
      401,
    );
  });
});

test("there is nothing for a key that never wrote", async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await request(base, "GET")).status, 404);
  });
});

test("a block is created, and read back as it was sent, with its revision", async () => {
  await withServer({}, async ({ base }) => {
    const created = await put(base, '"0"');
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("etag"), '"1"');

    const read = await request(base, "GET");
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("etag"), '"1"');
    assert.deepEqual(await read.json(), BLOCK);
  });
});

test("a write must say which revision it saw", async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await request(base, "PUT", { body: BLOCK })).status, 428);
    assert.equal((await put(base, "1")).status, 428, "without quotes");
    assert.equal((await put(base, '"x"')).status, 428);
  });
});

test("two computers cannot overwrite each other: a stale write gets a 412 with the current revision", async () => {
  await withServer({}, async ({ base }) => {
    await put(base, '"0"');
    const second = await put(base, '"1"', { ...BLOCK, data: "bmV3" });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("etag"), '"2"');

    const stale = await put(base, '"1"', { ...BLOCK, data: "b2xk" });
    assert.equal(stale.status, 412);
    assert.equal(stale.headers.get("etag"), '"2"');
    assert.equal((await (await request(base, "GET")).json()).data, "bmV3", "the newer data is still there");

    assert.equal((await put(base, '"0"')).status, 412, "creating over an existing block");
  });
});

test("two writes at once with the same revision: one wins and the other gets a 412", async () => {
  await withServer({}, async ({ base }) => {
    await put(base, '"0"');
    const results = await Promise.all([
      put(base, '"1"', { ...BLOCK, data: "YQ" }),
      put(base, '"1"', { ...BLOCK, data: "Yg" }),
    ]);
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 412]);
  });
});

test("every key has its own block", async () => {
  await withServer({}, async ({ base }) => {
    await put(base, '"0"', { ...BLOCK, data: "b25l" });
    assert.equal((await request(base, "GET", { token: OTHER_TOKEN })).status, 404);
    await put(base, '"0"', { ...BLOCK, data: "dHdv" }, { token: OTHER_TOKEN });
    assert.equal((await (await request(base, "GET")).json()).data, "b25l");
    assert.equal((await (await request(base, "GET", { token: OTHER_TOKEN })).json()).data, "dHdv");
  });
});

test("the key is not kept: the file is named by its hash and does not hold it", async () => {
  await withServer({}, async ({ base, dataDir }) => {
    await put(base, '"0"');
    const files = await readdir(dataDir);
    assert.equal(files.length, 1);
    assert.ok(!files[0].includes(TOKEN));
    assert.match(files[0], /^[0-9a-f]{64}\.json$/);
    assert.ok(!(await readFile(join(dataDir, files[0]), "utf8")).includes(TOKEN));
  });
});

test("only a block is accepted, not any json or any shape", async () => {
  await withServer({}, async ({ base }) => {
    const bad = [
      "not json",
      "[]",
      "null",
      { v: 1, iv: "abc", data: "def", extra: "x" },
      { v: 2, iv: "abc", data: "def" },
      { v: 1, iv: "", data: "def" },
      { v: 1, iv: "abc", data: "" },
      { v: 1, iv: "a b", data: "def" },
      { v: 1, iv: "abc", data: "de+f/" },
      { v: 1, iv: "a".repeat(65), data: "def" },
      { v: 1, iv: 5, data: "def" },
    ];
    for (const body of bad) {
      assert.equal((await put(base, '"0"', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await request(base, "GET")).status, 404, "nothing was stored");
  });
});

test("a write must be json", async () => {
  await withServer({}, async ({ base }) => {
    const response = await fetch(`${base}/v1/blob`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${TOKEN}`, "If-Match": '"0"', "Content-Type": "text/plain" },
      body: JSON.stringify(BLOCK),
    });
    assert.equal(response.status, 415);
  });
});

test("a block that is too big is refused and not stored", async () => {
  await withServer({ maxBodyBytes: 1000 }, async ({ base }) => {
    const response = await put(base, '"0"', { ...BLOCK, data: "a".repeat(2000) });
    assert.equal(response.status, 413);
    assert.equal((await request(base, "GET")).status, 404);
  });
});

test("a person can delete their data, and deleting twice is fine", async () => {
  await withServer({}, async ({ base, dataDir }) => {
    await put(base, '"0"');
    assert.equal((await request(base, "DELETE")).status, 204);
    assert.equal((await request(base, "GET")).status, 404);
    assert.deepEqual(await readdir(dataDir), []);
    assert.equal((await request(base, "DELETE")).status, 204);
    assert.equal((await put(base, '"0"')).status, 201, "and the key can be used again");
  });
});

test("when the server is full no new block is created, but existing ones can change", async () => {
  await withServer({ maxBlobs: 1 }, async ({ base }) => {
    assert.equal((await put(base, '"0"')).status, 201);
    assert.equal((await put(base, '"0"', BLOCK, { token: OTHER_TOKEN })).status, 507);
    assert.equal((await put(base, '"1"')).status, 200);
    assert.equal((await request(base, "DELETE")).status, 204);
    assert.equal((await put(base, '"0"', BLOCK, { token: OTHER_TOKEN })).status, 201, "there is room again");
  });
});

test("an address that asks too often is slowed down, and other addresses are not", async () => {
  await withServer({ perMinutePerAddress: 3, proxyHops: 1 }, async ({ base }) => {
    const from = (address) => ({ headers: { "X-Forwarded-For": address } });
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await request(base, "GET", from("10.0.0.1"))).status, 404);
    }
    const slowed = await request(base, "GET", from("10.0.0.1"));
    assert.equal(slowed.status, 429);
    assert.equal(slowed.headers.get("retry-after"), "60");
    assert.equal((await request(base, "GET", from("10.0.0.2"))).status, 404);
  });
});

test("an address cannot dodge the limit by writing its own forwarded address", async () => {
  await withServer({ perMinutePerAddress: 2, proxyHops: 1 }, async ({ base }) => {
    // The proxy adds the real address at the end; what the client writes before it is not believed
    const statuses = [];
    for (const fake of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      statuses.push(
        (await request(base, "GET", { headers: { "X-Forwarded-For": `${fake}, 9.9.9.9` } })).status,
      );
    }
    assert.deepEqual(statuses, [404, 404, 429]);
  });
});

test("a key that asks too often is slowed down", async () => {
  await withServer({ perMinutePerToken: 2 }, async ({ base }) => {
    assert.equal((await request(base, "GET")).status, 404);
    assert.equal((await request(base, "GET")).status, 404);
    assert.equal((await request(base, "GET")).status, 429);
    assert.equal((await request(base, "GET", { token: OTHER_TOKEN })).status, 404);
  });
});

test("the limit starts again after a minute", async () => {
  let time = 1_000_000;
  await withServer({ perMinutePerAddress: 1, now: () => time }, async ({ base }) => {
    assert.equal((await request(base, "GET")).status, 404);
    assert.equal((await request(base, "GET")).status, 429);
    time += 61_000;
    assert.equal((await request(base, "GET")).status, 404);
  });
});

test("a block nobody used for a long time is deleted, and a used one is kept", async () => {
  let time = Date.UTC(2026, 0, 1);
  await withServer({ ttlDays: 10, now: () => time }, async ({ app, base }) => {
    await put(base, '"0"'); // TOKEN
    await put(base, '"0"', BLOCK, { token: OTHER_TOKEN });
    time += 8 * 24 * 3600 * 1000;
    await request(base, "GET", { token: OTHER_TOKEN }); // read after 8 days: it is used
    time += 5 * 24 * 3600 * 1000; // 13 days since the first, 5 since the read
    assert.equal(await app.sweep(), 1);
    assert.equal((await request(base, "GET")).status, 404);
    assert.equal((await request(base, "GET", { token: OTHER_TOKEN })).status, 200);
  });
});

test("only the known paths and methods answer", async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await request(base, "GET", { path: "/" })).status, 404);
    assert.equal((await request(base, "GET", { path: "/v1/other" })).status, 404);
    assert.equal((await request(base, "GET", { path: "/v1/blob/../../etc/passwd" })).status, 404);
    const post = await request(base, "POST", { body: BLOCK });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, PUT, DELETE");
  });
});

test("answers are not cached and open no door to other sites", async () => {
  await withServer({}, async ({ base }) => {
    const response = await request(base, "GET");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
