/**
 * Talks to Mosaik: the hub on the computer of the person (`http://127.0.0.1:<port>` or
 * `http://localhost:<port>`), or the person's own Mosaik server on the internet (an `https://` address),
 * which only takes data with this computer's device token (made in Mosaik, Fuentes → Dispositivos). Any
 * other address is refused before it is saved. The way to reach it (`fetchImpl`) is given from outside,
 * so it is tested with no browser.
 *
 * What the hub answers is turned into what to do with the queue (`sendBatch`):
 *
 * - `ok`: every event of the batch was handled (accepted, already there, or refused for good)
 * - `retry`: Mosaik is not running, or had a problem; the events wait for the next time
 * - `outdated`: Mosaik is running but does not take events yet (it has to be updated)
 * - `forbidden`, `bad-request`: Mosaik refused the request; the events wait, and the error is shown
 * - `unauthorized`: the server did not take the token (wrong or revoked); the events wait
 * - `too-large`: the batch was too big; it is sent again in smaller ones
 */

export const DEFAULT_HUB_URL = "http://127.0.0.1:7300";

/** How long to wait for the hub: on the same computer it answers at once or not at all. */
export const TIMEOUT_MS = 5000;

/** A server on the internet can take longer, above all with a full batch of history. */
export const REMOTE_TIMEOUT_MS = 20_000;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** Whether the address is the hub on this computer (as opposed to a Mosaik server on the internet). */
export function isLocalHub(baseUrl) {
  const url = new URL(baseUrl);
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

const timeoutFor = (baseUrl, timeoutMs) =>
  timeoutMs ?? (isLocalHub(baseUrl) ? TIMEOUT_MS : REMOTE_TIMEOUT_MS);

/**
 * A device token as Mosaik makes them (`mkd_…`), or `null`. It is a secret: it is kept only in this
 * browser's local storage and sent only to the address it was given for.
 */
export function normalizeToken(text) {
  const token = String(text ?? "").trim();
  return /^mkd_[\w-]{20,200}$/.test(token) ? token : null;
}

const authorization = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

/**
 * The address of the hub as it is kept, `http://host:port` on this computer or `https://host` for a
 * Mosaik server, or `null` if it is neither (plain http to another computer is refused: the data and
 * the token would travel in the clear). A path, a user or a query are not accepted either: the hub is its
 * own origin.
 */
export function normalizeHubUrl(text) {
  let url;
  try {
    url = new URL(String(text ?? "").trim());
  } catch {
    return null;
  }
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (
    (!local && url.protocol !== "https:") ||
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
 * The host permission that reaching the hub needs, as `chrome.permissions` takes it: that host only. A
 * pattern with no port is for any port, which is how the manifest names it.
 */
export const hubOrigins = (baseUrl) => {
  const url = new URL(baseUrl);
  return [`${url.protocol}//${url.hostname}/*`];
};

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
export async function checkHealth({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs }) {
  const response = await request(
    fetchImpl,
    `${baseUrl}/api/health`,
    { method: "GET" },
    timeoutFor(baseUrl, timeoutMs),
  );
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
 * Whether a Mosaik server takes this token, and for which device.
 * @returns {Promise<{ ok: true, device: string } | { ok: false, error: string }>}
 *   `error` is `token-invalid`, `not-running`, `outdated` (a server too old to check tokens) or `http-<status>`
 */
export async function checkDevice({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs }) {
  const response = await request(
    fetchImpl,
    `${baseUrl}/api/agent/whoami`,
    { method: "GET", headers: authorization(token) },
    timeoutFor(baseUrl, timeoutMs),
  );
  if (!response) {
    return { ok: false, error: "not-running" };
  }
  if (response.status === 401) {
    return { ok: false, error: "token-invalid" };
  }
  if (response.status === 404) {
    return { ok: false, error: "outdated" };
  }
  if (!response.ok) {
    return { ok: false, error: `http-${response.status}` };
  }
  const body = await readJson(response);
  return { ok: true, device: typeof body?.device === "string" ? body.device.slice(0, 64) : "" };
}

/**
 * Sends a batch of events and says what to do with them. `token` goes along when there is one: a Mosaik
 * server needs it, the hub on this computer does not.
 * @returns {Promise<
 *   | { kind: "ok", accepted: number, duplicates: number, rejected: { index: number, id: string, error: string }[] }
 *   | { kind: "retry" | "outdated" | "forbidden" | "bad-request" | "too-large" | "unauthorized", error: string }
 * >}
 */
export async function sendBatch({ baseUrl, events, token = null, fetchImpl = globalThis.fetch, timeoutMs }) {
  const response = await request(
    fetchImpl,
    `${baseUrl}/api/ingest/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization(token) },
      body: JSON.stringify({ events }),
    },
    timeoutFor(baseUrl, timeoutMs),
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
  if (response.status === 401) {
    return { kind: "unauthorized", error: "token-invalid" };
  }
  if (response.status === 403) {
    return { kind: "forbidden", error: await errorDetail(response) };
  }
  return { kind: "retry", error: response.status >= 500 ? "server" : `http-${response.status}` };
}
