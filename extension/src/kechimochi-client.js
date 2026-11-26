/**
 * Talks to Kechimochi (https://github.com/Morgawr/kechimochi), a desktop immersion tracker, through its
 * optional HTTP API: off by default in Kechimochi, unauthenticated, at `http://127.0.0.1:3031` unless the
 * person changed it (see its `docs/http-api.md`). The way to reach it (`fetchImpl`) is given from outside,
 * so it is tested with no browser.
 *
 * Only the addresses Kechimochi itself answers on are taken: this computer (`localhost`, `127.x.x.x`), or,
 * in its LAN mode, a private address of the home network (`10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`).
 * Kechimochi refuses any other host with a 403, and the data would leave the home network. IPv6 addresses
 * are not taken: Kechimochi's own address is IPv4, and a browser host permission for them is not reliable.
 *
 * The background script reaches it with the host permission of that address only, which lets an extension
 * read the answer whatever CORS says, so Kechimochi's "Allowed Browser Origins" can stay empty. Kechimochi
 * never refuses a request for its Origin: that list only adds CORS headers to the answers, for web pages.
 */

export const DEFAULT_KECHIMOCHI_URL = "http://127.0.0.1:3031";

/** Kechimochi runs on this computer or in the home network: it answers at once or not at all. */
export const TIMEOUT_MS = 10_000;

/** Whether a host name is one Kechimochi answers on: this computer, or a private IPv4 address. */
export function isKechimochiHost(hostname) {
  if (hostname === "localhost") {
    return true;
  }
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)?.slice(1).map(Number);
  if (!parts || parts.some((part) => part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/**
 * The address of Kechimochi as it is kept, `http://host:port`, or `null` if it is not one Kechimochi
 * answers on. A path of `/api` is taken off (the docs show the address both ways); any other path, a
 * user, a query or https are refused: Kechimochi serves plain http at its own origin.
 */
export function normalizeKechimochiUrl(text) {
  let url;
  try {
    url = new URL(String(text ?? "").trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    !isKechimochiHost(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["/", "/api", "/api/"].includes(url.pathname)
  ) {
    return null;
  }
  return url.origin;
}

/**
 * The host permission that reaching Kechimochi needs, as `chrome.permissions` takes it: that host only,
 * on any port (a pattern with no port is for every port, as the manifest names its hosts).
 */
export const kechimochiOrigins = (baseUrl) => [`http://${new URL(baseUrl).hostname}/*`];

/** `fetchImpl` with a time limit. A network error and a timeout are both `null`. */
async function send(fetchImpl, url, init, timeoutMs) {
  try {
    return await fetchImpl(url, {
      ...init,
      // Never follow a redirect: Kechimochi does not make any, and the data must stay at that address
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
}

/** A short text of what Kechimochi said about an error (it answers errors in plain text), for the panel. */
async function errorDetail(response) {
  let text = "";
  try {
    text = (await response.text()).replace(/\s+/g, " ").trim();
  } catch {
    // Nothing to say
  }
  // An HTML error page from something else at that address is not worth showing
  return text.startsWith("<") ? "" : text.slice(0, 200);
}

/**
 * What a failed answer means: `not-running` (nothing answers, or Kechimochi's HTTP API is off),
 * `forbidden` (403: Kechimochi does not take this host, as in local mode from another computer),
 * `not-found` (404: a route Kechimochi does not have, or the media or log is gone), `bad-request` (400),
 * `conflict` (409: a media entry with that title and variant exists), `server` (5xx) or `http-<status>`.
 */
async function failure(response) {
  if (!response) {
    return { ok: false, error: "not-running", detail: "" };
  }
  const error =
    { 400: "bad-request", 403: "forbidden", 404: "not-found", 409: "conflict" }[response.status] ??
    (response.status >= 500 ? "server" : `http-${response.status}`);
  return { ok: false, error, detail: await errorDetail(response) };
}

async function readJson(response) {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, error: "invalid-answer", detail: "" };
  }
}

/**
 * Makes the calls to one Kechimochi. Each one resolves to `{ ok: true, value }` or
 * `{ ok: false, error, detail }` (see `failure`), and never throws.
 */
export function kechimochiClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }) {
  async function call(method, path, body) {
    const init = {
      method,
      headers: {
        Accept: "application/json",
        // Kechimochi asks for it on every mutation that is not JSON; sending it always does no harm
        "X-Kechimochi-API": "1",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const response = await send(fetchImpl, `${baseUrl}/api/${path}`, init, timeoutMs);
    if (!response?.ok) {
      return failure(response);
    }
    return readJson(response);
  }

  /** A new id from a POST, a positive whole number; anything else is not taken as done. */
  const newId = (result) =>
    result.ok && !(Number.isInteger(result.value) && result.value > 0)
      ? { ok: false, error: "invalid-answer", detail: "" }
      : result;

  /** A list of rows with a positive whole `id` each, or `invalid-answer`. */
  const rows = (result) =>
    result.ok &&
    !(
      Array.isArray(result.value) &&
      result.value.every((row) => row && Number.isInteger(row.id) && row.id > 0)
    )
      ? { ok: false, error: "invalid-answer", detail: "" }
      : result;

  return {
    /**
     * Whether Kechimochi answers: its API version, as `http-0.3.3` (or `web-0.3.3`). Something else at that address (a
     * 404, or an answer that is not that) is `not-kechimochi`.
     */
    async version() {
      const result = await call("GET", "version");
      if (!result.ok) {
        return result.error === "not-found" ? { ...result, error: "not-kechimochi" } : result;
      }
      // The desktop app answers "http-0.3.3" (src-tauri/src/http_api.rs) and the web server, which people
      // run on another computer of the home network, "web-0.3.3" (src-tauri/src/bin/web_server.rs)
      return typeof result.value === "string" && /^(http|web)-/.test(result.value)
        ? { ok: true, value: result.value.slice(0, 40) }
        : { ok: false, error: "not-kechimochi", detail: "" };
    },
    listMedia: async () => rows(await call("GET", "media")),
    addMedia: async (media) => newId(await call("POST", "media", { ...media, id: null, uid: null })),
    listLogs: async () => rows(await call("GET", "logs")),
    addLog: async (log) => newId(await call("POST", "logs", { ...log, id: null })),
    updateLog: (id, log) => call("PUT", `logs/${id}`, { ...log, id }),
    deleteLog: (id) => call("DELETE", `logs/${id}`),
  };
}
