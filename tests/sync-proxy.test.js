// What happened in a real browser: a host in front of the server compresses the answer and, when it does,
// makes the ETag weak (W/"2"). A client that only read the strong form could not read any answer that was
// big enough to be compressed, so the second computer of a person always failed to join. These tests put
// a proxy that does the same in front of the real server.
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createServer } from "../server/server.js";
import { createClient, revisionOf } from "../extension/src/sync-client.js";
import { deriveKeys, newSyncKey, parseSyncKey } from "../extension/src/sync-crypto.js";
import { syncOnce } from "../extension/src/sync-engine.js";
import { effectiveLog, newDeviceId } from "../extension/src/sync-data.js";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server) => new Promise((resolve) => server.close(resolve));

/** The real server, and a proxy in front of it that changes the headers of the answers. */
async function behindProxy(changeHeaders, body) {
  const dataDir = await mkdtemp(join(tmpdir(), "deuchan-proxy-"));
  const app = createServer({ dataDir });
  await listen(app.server);
  const upstream = app.server.address().port;
  const proxy = createHttpServer((request, response) => {
    const forwarded = httpRequest(
      {
        host: "127.0.0.1",
        port: upstream,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (answer) => {
        response.writeHead(answer.statusCode, changeHeaders({ ...answer.headers }));
        answer.pipe(response);
      },
    );
    request.pipe(forwarded);
  });
  await listen(proxy);
  try {
    await body(`http://127.0.0.1:${proxy.address().port}`);
  } finally {
    await close(proxy);
    await close(app.server);
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** Compression makes the ETag weak. The server of the first version did not have X-Revision. */
const weakEtagOnly = (headers) => {
  delete headers["x-revision"];
  if (headers.etag) {
    headers.etag = `W/${headers.etag}`;
  }
  return headers;
};

/** An ETag that cannot be read at all, with the revision only in X-Revision. */
const unreadableEtag = (headers) => {
  if (headers.etag) {
    headers.etag = "garbage";
  }
  return headers;
};

async function twoComputersConverge(baseUrl) {
  const keys = await deriveKeys(parseSyncKey(newSyncKey()));
  const computer = (days) => ({
    deviceId: newDeviceId(),
    log: { version: 1, days },
    others: {},
    client: createClient({ baseUrl, token: keys.token }),
  });
  const sync = async (device, extra = {}) => {
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
  };
  const a = computer({ "2026-10-24": 100 });
  const b = computer({ "2026-10-24": 40 });
  await sync(a);
  await sync(b, { mustExist: true }); // the second computer reads what the first one wrote: the case that failed
  await sync(a);
  a.log = { version: 1, days: { "2026-10-24": 160 } }; // and A writes again over a revision it has read
  await sync(a);
  await sync(b);
  return [effectiveLog(a.log, a.others).days["2026-10-24"], effectiveLog(b.log, b.others).days["2026-10-24"]];
}

test("two computers converge when the host turns the ETag weak", async () => {
  await behindProxy(weakEtagOnly, async (baseUrl) => {
    assert.deepEqual(await twoComputersConverge(baseUrl), [200, 200]);
  });
});

test("two computers converge when the ETag cannot be read but X-Revision is there", async () => {
  await behindProxy(unreadableEtag, async (baseUrl) => {
    assert.deepEqual(await twoComputersConverge(baseUrl), [200, 200]);
  });
});

test("revisionOf reads X-Revision first, then a strong or a weak ETag, and nothing else", () => {
  const answer = (headers) => ({ headers: new Headers(headers) });
  assert.equal(revisionOf(answer({ "X-Revision": "7" })), 7);
  assert.equal(revisionOf(answer({ ETag: '"3"' })), 3);
  assert.equal(revisionOf(answer({ ETag: 'W/"3"' })), 3);
  assert.equal(revisionOf(answer({ "X-Revision": "7", ETag: '"3"' })), 7, "the header of the server wins");
  assert.equal(revisionOf(answer({ "X-Revision": "nope", ETag: 'W/"4"' })), 4);
  for (const headers of [
    {},
    { ETag: "garbage" },
    { ETag: '"abc"' },
    { ETag: 'W/""' },
    { "X-Revision": "-1" },
    { "X-Revision": "1e3" },
  ]) {
    assert.equal(revisionOf(answer(headers)), null, JSON.stringify(headers));
  }
});

test("the server says the revision in X-Revision as well, in every answer that has one", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "deuchan-revision-"));
  const app = createServer({ dataDir });
  await listen(app.server);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const token = "A".repeat(43);
    const send = (method, headers = {}, body) =>
      fetch(`${base}/v1/blob`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
    const block = JSON.stringify({ v: 1, iv: "abc_DEF-123", data: "c2VjcmV0" });
    const json = { "Content-Type": "application/json" };

    const created = await send("PUT", { ...json, "If-Match": '"0"' }, block);
    assert.equal(created.headers.get("x-revision"), "1");
    const read = await send("GET");
    assert.equal(read.headers.get("x-revision"), "1");
    assert.equal(read.headers.get("etag"), '"1"');
    const stale = await send("PUT", { ...json, "If-Match": '"0"' }, block);
    assert.equal(stale.status, 412);
    assert.equal(stale.headers.get("x-revision"), "1");
  } finally {
    await close(app.server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("the server accepts a weak validator back: a proxy may have turned the strong one into it", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "deuchan-weak-"));
  const app = createServer({ dataDir });
  await listen(app.server);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const send = (headers) =>
      fetch(`${base}/v1/blob`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${"B".repeat(43)}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ v: 1, iv: "abc_DEF-123", data: "c2VjcmV0" }),
      });
    assert.equal((await send({ "If-Match": 'W/"0"' })).status, 201);
    assert.equal((await send({ "If-Match": 'W/"1"' })).status, 200);
    assert.equal(
      (await send({ "If-Match": 'W/"1"' })).status,
      412,
      "and it is still compared with the revision",
    );
    assert.equal(
      (await send({ "If-Match": "W/1" })).status,
      428,
      "what is not a validator is still turned away",
    );
  } finally {
    await close(app.server);
    await rm(dataDir, { recursive: true, force: true });
  }
});
