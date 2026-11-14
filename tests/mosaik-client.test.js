import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import {
  DEFAULT_HUB_URL,
  checkHealth,
  hubOrigins,
  normalizeHubUrl,
  sendBatch,
} from "../extension/src/mosaik-client.js";

const EVENT = { id: "deuchan:rm:2026-11-14:dQw4w9WgXcQ:1", kind: "video_removed" };

/** A fetch that answers with `status` and `body`, and remembers what it was asked. */
function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

const failing = async () => {
  throw new TypeError("Failed to fetch");
};

test("only an address on this computer is taken, and it is kept as an origin", () => {
  assert.equal(normalizeHubUrl(DEFAULT_HUB_URL), "http://127.0.0.1:7300");
  assert.equal(normalizeHubUrl(" http://localhost:8123/ "), "http://localhost:8123");
  assert.equal(normalizeHubUrl("http://127.0.0.1"), "http://127.0.0.1");
  for (const text of [
    "https://127.0.0.1:7300",
    "http://192.168.0.10:7300",
    "http://example.com",
    "http://127.0.0.1.example.com:7300",
    "http://localhost.evil:7300",
    "http://user:pass@127.0.0.1:7300",
    "http://127.0.0.1:7300/api",
    "http://127.0.0.1:7300/?x=1",
    "ftp://127.0.0.1",
    "127.0.0.1:7300",
    "",
    null,
  ]) {
    assert.equal(normalizeHubUrl(text), null, String(text));
  }
});

test("the permission asked for is the host, for any port", () => {
  assert.deepEqual(hubOrigins("http://127.0.0.1:7300"), ["http://127.0.0.1/*"]);
  assert.deepEqual(hubOrigins("http://localhost:9000"), ["http://localhost/*"]);
});

test("the health check finds Mosaik and its version", async () => {
  const { fetchImpl, calls } = fakeFetch(200, {
    status: "ok",
    name: "mosaik",
    version: "0.3.0",
    schemaVersion: 1,
    now: 1,
  });
  assert.deepEqual(await checkHealth({ baseUrl: DEFAULT_HUB_URL, fetchImpl }), {
    ok: true,
    version: "0.3.0",
    schemaVersion: 1,
  });
  assert.equal(calls[0].url, "http://127.0.0.1:7300/api/health");
});

test("the health check tells apart nothing running, something else, and an error", async () => {
  assert.deepEqual(await checkHealth({ baseUrl: DEFAULT_HUB_URL, fetchImpl: failing }), {
    ok: false,
    error: "not-running",
  });
  const other = fakeFetch(200, { status: "ok", name: "something-else" });
  assert.deepEqual(await checkHealth({ baseUrl: DEFAULT_HUB_URL, fetchImpl: other.fetchImpl }), {
    ok: false,
    error: "not-mosaik",
  });
  const broken = fakeFetch(500, {});
  assert.deepEqual(await checkHealth({ baseUrl: DEFAULT_HUB_URL, fetchImpl: broken.fetchImpl }), {
    ok: false,
    error: "http-500",
  });
});

test("a batch is posted as JSON, and a 200 says what happened to each event", async () => {
  const { fetchImpl, calls } = fakeFetch(200, {
    accepted: 1,
    duplicates: 0,
    rejected: [{ index: 1, id: "x", error: "bad seconds" }],
  });
  const result = await sendBatch({ baseUrl: DEFAULT_HUB_URL, events: [EVENT, EVENT], fetchImpl });
  assert.deepEqual(result, {
    kind: "ok",
    accepted: 1,
    duplicates: 0,
    rejected: [{ index: 1, id: "x", error: "bad seconds" }],
  });
  assert.equal(calls[0].url, "http://127.0.0.1:7300/api/ingest/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { events: [EVENT, EVENT] });
});

test("every answer of the table becomes what to do with the queue", async () => {
  const cases = [
    [400, { error: "seconds must be a number" }, { kind: "bad-request", error: "seconds must be a number" }],
    [403, { error: "origin not allowed" }, { kind: "forbidden", error: "origin not allowed" }],
    [403, undefined, { kind: "forbidden", error: "HTTP 403" }],
    [404, { error: "not found" }, { kind: "outdated", error: "outdated" }],
    [413, undefined, { kind: "too-large", error: "too-large" }],
    [500, undefined, { kind: "retry", error: "server" }],
    [503, undefined, { kind: "retry", error: "server" }],
    [418, undefined, { kind: "retry", error: "http-418" }],
    [200, { accepted: 1 }, { kind: "retry", error: "invalid-answer" }],
    [200, undefined, { kind: "retry", error: "invalid-answer" }],
  ];
  for (const [status, body, expected] of cases) {
    const { fetchImpl } = fakeFetch(status, body);
    assert.deepEqual(
      await sendBatch({ baseUrl: DEFAULT_HUB_URL, events: [EVENT], fetchImpl }),
      expected,
      `${status}`,
    );
  }
  assert.deepEqual(await sendBatch({ baseUrl: DEFAULT_HUB_URL, events: [EVENT], fetchImpl: failing }), {
    kind: "retry",
    error: "not-running",
  });
});

test("a hub that does not answer in time is as if it was not running", async () => {
  // A real server on this computer that takes the request and never answers
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const started = Date.now();
    assert.deepEqual(await sendBatch({ baseUrl, events: [EVENT], timeoutMs: 200 }), {
      kind: "retry",
      error: "not-running",
    });
    assert.deepEqual(await checkHealth({ baseUrl, timeoutMs: 200 }), { ok: false, error: "not-running" });
    assert.ok(Date.now() - started < 3000);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
