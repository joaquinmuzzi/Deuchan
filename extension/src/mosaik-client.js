/**
 * Talks to Mosaik, the hub on the computer of the person. It only ever talks to that computer: the
 * address has to be `http://127.0.0.1:<port>` or `http://localhost:<port>`, and anything else is
 * refused before it is saved. The way to reach it (`fetchImpl`) is given from outside, so it is tested
 * with no browser.
 *
 * What the hub answers is turned into what to do with the queue (`sendBatch`):
 *
 * - `ok`: every event of the batch was handled (accepted, already there, or refused for good)
 * - `retry`: Mosaik is not running, or had a problem; the events wait for the next time
 * - `outdated`: Mosaik is running but does not take events yet (it has to be updated)
 * - `forbidden`, `bad-request`: Mosaik refused the request; the events wait, and the error is shown
 * - `too-large`: the batch was too big; it is sent again in smaller ones
 */

export const DEFAULT_HUB_URL = "http://127.0.0.1:7300";

/** How long to wait for the hub: on the same computer it answers at once or not at all. */
export const TIMEOUT_MS = 5000;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * The address of the hub as it is kept, `http://host:port`, or `null` if it is not one on this
 * computer. A path, a user or a query are not accepted either: the hub is its own origin.
 */
export function normalizeHubUrl(text) {
  let url;
  try {
    url = new URL(String(text ?? "").trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    return null;
  }
  return url.origin;
}

/**
 * The host permission that reaching the hub needs, as `chrome.permissions` takes it. A pattern with no
 * port is for any port, which is how the manifest names it.
 */
export const hubOrigins = (baseUrl) => [`http://${new URL(baseUrl).hostname}/*`];

/** `fetchImpl` with a time limit. A network error and a timeout are both `null`. */
async function request(fetchImpl, url, init, timeoutMs) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** A short text of what the hub said about an error, for the panel. */
async function errorDetail(response) {
  const body = await readJson(response);
  const text =
    typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "";
  return text.slice(0, 200) || `HTTP ${response.status}`;
}

/**
 * Whether Mosaik is running at that address.
 * @returns {Promise<{ ok: true, version: string, schemaVersion: number } | { ok: false, error: string }>}
 *   `error` is `not-running`, `not-mosaik` or `http-<status>`
 */
export async function checkHealth({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }) {
  const response = await request(fetchImpl, `${baseUrl}/api/health`, { method: "GET" }, timeoutMs);
  if (!response) {
    return { ok: false, error: "not-running" };
  }
  if (!response.ok) {
    return { ok: false, error: `http-${response.status}` };
  }
  const body = await readJson(response);
  if (body?.name !== "mosaik") {
    // Something else listens on that port
    return { ok: false, error: "not-mosaik" };
  }
  return {
    ok: true,
    version: typeof body.version === "string" ? body.version.slice(0, 40) : "",
    schemaVersion: Number.isFinite(body.schemaVersion) ? body.schemaVersion : null,
  };
}

/**
 * Sends a batch of events and says what to do with them.
 * @returns {Promise<
 *   | { kind: "ok", accepted: number, duplicates: number, rejected: { index: number, id: string, error: string }[] }
 *   | { kind: "retry" | "outdated" | "forbidden" | "bad-request" | "too-large", error: string }
 * >}
 */
export async function sendBatch({ baseUrl, events, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }) {
  const response = await request(
    fetchImpl,
    `${baseUrl}/api/ingest/events`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) },
    timeoutMs,
  );
  if (!response) {
    return { kind: "retry", error: "not-running" };
  }
  if (response.status === 200) {
    const body = await readJson(response);
    if (
      !Number.isFinite(body?.accepted) ||
      !Number.isFinite(body?.duplicates) ||
      !Array.isArray(body?.rejected)
    ) {
      // A 200 that does not say what happened: nothing is taken for done
      return { kind: "retry", error: "invalid-answer" };
    }
    return {
      kind: "ok",
      accepted: body.accepted,
      duplicates: body.duplicates,
      rejected: body.rejected.map((item) => ({
        index: Number(item?.index),
        id: String(item?.id ?? ""),
        error: String(item?.error ?? "").slice(0, 200),
      })),
    };
  }
  if (response.status === 404) {
    return { kind: "outdated", error: "outdated" };
  }
  if (response.status === 413) {
    return { kind: "too-large", error: "too-large" };
  }
  if (response.status === 400) {
    return { kind: "bad-request", error: await errorDetail(response) };
  }
  if (response.status === 403) {
    return { kind: "forbidden", error: await errorDetail(response) };
  }
  return { kind: "retry", error: response.status >= 500 ? "server" : `http-${response.status}` };
}
