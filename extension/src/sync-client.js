/**
 * Talks to the sync server (see `server/server.js`): reads, writes and deletes the encrypted block of a
 * sync key. It knows nothing about what is inside the block. Every failure is a `SyncError` with a
 * `kind` that the rest can act on:
 *
 * - `network`      the server could not be reached, or did not answer in time
 * - `rate-limited` too many requests; `retryAfter` is the seconds to wait
 * - `auth`         the server did not accept the key
 * - `full`         the server cannot take one more person
 * - `too-large`    the block is bigger than the server allows
 * - `server`       the server had a problem
 * - `invalid`       anything else that was not expected
 */

export class SyncError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
    Object.assign(this, details);
  }
}

const TIMEOUT_MS = 15_000;

/**
 * The revision of an answer, or `null`: from the `X-Revision` header of the server, or from the `ETag`,
 * strong (`"3"`) or weak (`W/"3"`). A host that compresses the answer makes the `ETag` weak, and a
 * client that only knew the strong form could not read any answer that was big enough to be compressed.
 */
export function revisionOf(response) {
  const own = /^\d{1,12}$/.exec(response.headers.get("x-revision") ?? "");
  if (own) {
    return Number(own[0]);
  }
  const match = /^(?:W\/)?"(\d{1,12})"$/.exec(response.headers.get("etag") ?? "");
  return match ? Number(match[1]) : null;
}

/** The error for an answer that is not the one expected. */
function failure(response) {
  const { status } = response;
  if (status === 401) {
    return new SyncError("auth", "the server did not accept the key");
  }
  if (status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new SyncError("rate-limited", "too many requests", {
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
    });
  }
  if (status === 507) {
    return new SyncError("full", "the server is full");
  }
  if (status === 413) {
    return new SyncError("too-large", "the data is too big");
  }
  if (status >= 500) {
    return new SyncError("server", `the server failed (${status})`);
  }
  return new SyncError("invalid", `unexpected answer (${status})`);
}

/**
 * @param {{ baseUrl: string, token: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createClient({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }) {
  async function send(method, headers = {}, body = undefined) {
    try {
      return await fetchImpl(`${baseUrl}/v1/blob`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
        // Nothing of the person goes with it: no cookies, no cache
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new SyncError("network", "the server could not be reached");
    }
  }

  return {
    /** The block and its revision, or `null` if there is none. */
    async get() {
      const response = await send("GET");
      if (response.status === 404) {
        return null;
      }
      if (response.status !== 200) {
        throw failure(response);
      }
      const rev = revisionOf(response);
      let block;
      try {
        block = await response.json();
      } catch {
        throw new SyncError("invalid", "the answer is not json");
      }
      if (rev === null) {
        throw new SyncError("invalid", "the answer has no revision");
      }
      return { rev, block };
    },

    /** Writes the block over the revision that was seen (`0` to create): `{ rev }` or `{ conflict: true }`. */
    async put(block, rev) {
      const response = await send(
        "PUT",
        { "Content-Type": "application/json", "If-Match": `"${rev}"` },
        JSON.stringify(block),
      );
      if (response.status === 412) {
        return { conflict: true };
      }
      if (response.status !== 200 && response.status !== 201) {
        throw failure(response);
      }
      return { rev: revisionOf(response) ?? rev + 1 };
    },

    /** Deletes the block: the way a person erases their data from the server. */
    async remove() {
      const response = await send("DELETE");
      if (response.status !== 204) {
        throw failure(response);
      }
    },
  };
}
