import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import {
  DEFAULT_HUB_URL,
  checkDevice,
  checkHealth,
  hubOrigins,
  isLocalHub,
  normalizeHubUrl,
  normalizeToken,
  sendBatch,
} from "../extension/src/mosaik-client.js";

const SERVER = "https://mosaik.example.app";
const TOKEN = `mkd_${"a".repeat(43)}`;

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

test("an address on this computer or an https server is taken, and it is kept as an origin", () => {
  assert.equal(normalizeHubUrl(DEFAULT_HUB_URL), "http://127.0.0.1:7300");
  assert.equal(normalizeHubUrl(" http://localhost:8123/ "), "http://localhost:8123");
  assert.equal(normalizeHubUrl("http://127.0.0.1"), "http://127.0.0.1");
  assert.equal(normalizeHubUrl(` ${SERVER}/ `), SERVER);
  assert.equal(normalizeHubUrl("https://127.0.0.1:7300"), "https://127.0.0.1:7300");
  for (const text of [
    // Plain http to another computer would carry the data and the token in the clear
    "http://mosaik.example.app",
    `${SERVER}/api`,
    `${SERVER}/?x=1`,
    "https://user:pass@mosaik.example.app",
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
  assert.deepEqual(hubOrigins(SERVER), ["https://mosaik.example.app/*"]);
});

test("a device token is taken only as Mosaik makes them, and only the hub here is local", () => {
  assert.equal(normalizeToken(` ${TOKEN} `), TOKEN);
  for (const text of ["", null, "mkd_short", `mks_${"a".repeat(43)}`, `mkd_${"a".repeat(40)}!`]) {
    assert.equal(normalizeToken(text), null, String(text));
  }
  assert.equal(isLocalHub(DEFAULT_HUB_URL), true);
  assert.equal(isLocalHub("http://localhost:8123"), true);
  assert.equal(isLocalHub(SERVER), false);
});

test("the token goes with every batch to a server, and a token the server does not take waits", async () => {
  const ok = fakeFetch(200, { accepted: 1, duplicates: 0, rejected: [] });
  await sendBatch({ baseUrl: SERVER, events: [EVENT], token: TOKEN, fetchImpl: ok.fetchImpl });
  assert.equal(ok.calls[0].url, `${SERVER}/api/ingest/events`);
  assert.equal(ok.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);

  const local = fakeFetch(200, { accepted: 1, duplicates: 0, rejected: [] });
  await sendBatch({ baseUrl: DEFAULT_HUB_URL, events: [EVENT], fetchImpl: local.fetchImpl });
  assert.equal(local.calls[0].init.headers.Authorization, undefined, "the hub here needs no token");

  const refused = fakeFetch(401, { error: "invalid_device_token" });
  assert.deepEqual(
    await sendBatch({ baseUrl: SERVER, events: [EVENT], token: TOKEN, fetchImpl: refused.fetchImpl }),
    { kind: "unauthorized", error: "token-invalid" },
  );
});

test("a server says which device a token is, or that it does not take it", async () => {
  const known = fakeFetch(200, { device: "deuchan" });
  assert.deepEqual(await checkDevice({ baseUrl: SERVER, token: TOKEN, fetchImpl: known.fetchImpl }), {
    ok: true,
    device: "deuchan",
  });
  assert.equal(known.calls[0].url, `${SERVER}/api/agent/whoami`);
  assert.equal(known.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  const cases = [
    [401, "token-invalid"],
    [404, "outdated"],
    [500, "http-500"],
  ];
  for (const [status, error] of cases) {
    const { fetchImpl } = fakeFetch(status, { error: "x" });
    assert.deepEqual(await checkDevice({ baseUrl: SERVER, token: TOKEN, fetchImpl }), { ok: false, error });
  }
  assert.deepEqual(await checkDevice({ baseUrl: SERVER, token: TOKEN, fetchImpl: failing }), {
    ok: false,
    error: "not-running",
  });
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
