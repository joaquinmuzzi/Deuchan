import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_KECHIMOCHI_URL,
  isKechimochiHost,
  kechimochiClient,
  kechimochiOrigins,
  normalizeKechimochiUrl,
} from "../extension/src/kechimochi-client.js";
import { createKechimochiStub } from "./kechimochi-stub.js";

test("only the addresses Kechimochi answers on are taken: this computer and the home network", () => {
  assert.equal(normalizeKechimochiUrl(DEFAULT_KECHIMOCHI_URL), "http://127.0.0.1:3031");
  assert.equal(normalizeKechimochiUrl(" http://localhost:3031/ "), "http://localhost:3031");
  assert.equal(normalizeKechimochiUrl("http://127.0.0.1:3031/api"), "http://127.0.0.1:3031");
  assert.equal(normalizeKechimochiUrl("http://127.0.0.1:3031/api/"), "http://127.0.0.1:3031");
  for (const lan of [
    "http://192.168.1.50:3031",
    "http://10.0.0.7:3031",
    "http://172.20.1.2:3031",
    "http://169.254.3.4:3031",
  ]) {
    assert.equal(normalizeKechimochiUrl(lan), lan);
  }
  for (const bad of [
    "https://127.0.0.1:3031",
    "http://8.8.8.8:3031",
    "http://172.32.0.1:3031",
    "http://192.169.0.1:3031",
    "http://example.com:3031",
    "http://[::1]:3031",
    "http://user:pass@127.0.0.1:3031",
    "http://127.0.0.1:3031/other",
    "http://127.0.0.1:3031/?x=1",
    "http://127.0.0.1:3031/#x",
    "http://999.1.1.1:3031",
    "ftp://127.0.0.1",
    "",
    null,
    "not a url",
  ]) {
    assert.equal(normalizeKechimochiUrl(bad), null, String(bad));
  }
  assert.equal(isKechimochiHost("127.8.9.10"), true);
  assert.equal(isKechimochiHost("1.2.3.4"), false);
});

test("the permission asked for is that host only, on any port", () => {
  assert.deepEqual(kechimochiOrigins("http://127.0.0.1:3031"), ["http://127.0.0.1/*"]);
  assert.deepEqual(kechimochiOrigins("http://192.168.1.50:3031"), ["http://192.168.1.50/*"]);
});

test("the version says whether Kechimochi answers, and something else is not taken for it", async () => {
  const stub = createKechimochiStub();
  const api = kechimochiClient({ baseUrl: DEFAULT_KECHIMOCHI_URL, fetchImpl: stub.fetch });
  assert.deepEqual(await api.version(), { ok: true, value: "http-0.3.3" });

  stub.setDown(true);
  assert.equal((await api.version()).error, "not-running");

  const other = kechimochiClient({
    baseUrl: DEFAULT_KECHIMOCHI_URL,
    fetchImpl: async () => new Response('{"name":"mosaik"}', { status: 200 }),
  });
  assert.equal((await other.version()).error, "not-kechimochi");
  // Kechimochi's web server (src-tauri/src/bin/web_server.rs) answers "web-<version>", its desktop app "http-"
  const webServer = kechimochiClient({
    baseUrl: DEFAULT_KECHIMOCHI_URL,
    fetchImpl: async () => new Response('"web-0.3.3"', { status: 200 }),
  });
  assert.deepEqual(await webServer.version(), { ok: true, value: "web-0.3.3" });
  const otherString = kechimochiClient({
    baseUrl: DEFAULT_KECHIMOCHI_URL,
    fetchImpl: async () => new Response('"ok"', { status: 200 }),
  });
  assert.equal((await otherString.version()).error, "not-kechimochi");
  const missing = kechimochiClient({
    baseUrl: DEFAULT_KECHIMOCHI_URL,
    fetchImpl: async () => new Response("<html>Not found</html>", { status: 404 }),
  });
  assert.deepEqual(await missing.version(), { ok: false, error: "not-kechimochi", detail: "" });
});

test("errors are told apart, with Kechimochi's own words", async () => {
  const stub = createKechimochiStub();
  const api = kechimochiClient({ baseUrl: DEFAULT_KECHIMOCHI_URL, fetchImpl: stub.fetch });
  assert.deepEqual(
    await api.addLog({ media_id: 1, duration_minutes: 5, characters: 0, date: "2026-11-25" }),
    {
      ok: false,
      error: "bad-request",
      detail: "Media 1 not found",
    },
  );
  const media = {
    title: "A",
    variant: "YouTube",
    default_activity_type: "Watching",
    status: "Active",
    language: "Japanese",
    description: "",
    cover_image: "",
    extra_data: "{}",
    content_type: "Unknown",
    tracking_status: "Ongoing",
  };
  assert.deepEqual(await api.addMedia(media), { ok: true, value: 1 });
  assert.equal((await api.addMedia(media)).error, "conflict");
  const forbidden = kechimochiClient({
    baseUrl: "http://192.168.1.50:3031",
    fetchImpl: async () =>
      new Response("Host header is not allowed for the local Kechimochi API", { status: 403 }),
  });
  assert.equal((await forbidden.listLogs()).error, "forbidden");
  const broken = kechimochiClient({
    baseUrl: DEFAULT_KECHIMOCHI_URL,
    fetchImpl: async () => new Response("oops", { status: 500 }),
  });
  assert.equal((await broken.listMedia()).error, "server");
  const odd = kechimochiClient({
    baseUrl: DEFAULT_KECHIMOCHI_URL,
    fetchImpl: async () => new Response('"seven"', { status: 200 }),
  });
  assert.equal((await odd.addLog({})).error, "invalid-answer");
  assert.equal((await odd.listLogs()).error, "invalid-answer");
});

test("requests go to that address only, with the API header, and follow no redirect", async () => {
  const seen = [];
  const api = kechimochiClient({
    baseUrl: "http://192.168.1.50:3031",
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return new Response("null", { status: 200 });
    },
  });
  await api.deleteLog(7);
  assert.equal(seen[0].url, "http://192.168.1.50:3031/api/logs/7");
  assert.equal(seen[0].init.method, "DELETE");
  assert.equal(seen[0].init.headers["X-Kechimochi-API"], "1");
  assert.equal(seen[0].init.redirect, "error");
});
