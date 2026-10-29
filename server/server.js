/**
 * The sync server of Deuchan: it keeps one encrypted block of data for each sync key, and nothing else.
 *
 * What it knows is little on purpose. The extension derives two things from the sync key of the
 * user: a token, which it sends to prove it knows the key, and an encryption key, which never
 * leaves the extension. The server stores the data encrypted with the second, under the hash of the
 * first, so it cannot read the data and cannot tell whose it is. There are no accounts, no emails
 * and no passwords.
 *
 * - `GET /v1/blob`    the block, with its revision in the `ETag`; 404 if there is none.
 * - `PUT /v1/blob`    replaces it. `If-Match` says which revision the client saw (`"0"` to create), so
 *                     that two computers cannot overwrite each other: a 412 means "read, merge, retry".
 * - `DELETE /v1/blob` deletes it, which is how a person erases their data.
 * - `GET /healthz`    for the host to check that it is running.
 *
 * There are limits for everything: the size of a block, the number of blocks, the requests per minute
 * of an address and of a key, and how long a block that nobody uses is kept.
 */
import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULTS = {
  /** The biggest block accepted, in bytes. The data of years of use is a few KB. */
  maxBodyBytes: 256 * 1024,
  /** The most blocks kept in total: the server says it is full instead of running out of disk. */
  maxBlobs: 50_000,
  /** A block nobody wrote or read for this long is deleted. */
  ttlDays: 400,
  /** Requests a minute from one address, and from one key. */
  perMinutePerAddress: 120,
  perMinutePerToken: 30,
  /**
   * The header in which the host puts the address of the client, such as `x-real-ip` on Railway. By
   * default there is none and the address is the one of the connection: a header that the host does
   * not write is written by the client, and believing it would let anyone dodge the limit.
   */
  addressHeader: null,
};

const DAY_MS = 24 * 3600 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

const hashOf = (token) => createHash("sha256").update(token).digest("hex");

function sendJson(response, status, body, headers = {}) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(text);
}

const fail = (response, status, error, headers) => sendJson(response, status, { error }, headers);

/** The block as the extension sends it: `{ v: 1, iv, data }`, the last two in base64url. */
function validBlock(block) {
  return (
    block !== null &&
    typeof block === "object" &&
    !Array.isArray(block) &&
    Object.keys(block).sort().join() === "data,iv,v" &&
    block.v === 1 &&
    typeof block.iv === "string" &&
    block.iv.length > 0 &&
    block.iv.length <= 64 &&
    BASE64URL.test(block.iv) &&
    typeof block.data === "string" &&
    block.data.length > 0 &&
    BASE64URL.test(block.data)
  );
}

/** Reads the body of a request, giving up as soon as it is bigger than `limit`. */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // Not destroyed here: the answer has to go out first, and the rest is thrown away
        reject(Object.assign(new Error("too large"), { status: 413 }));
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** A counter of requests in the current minute for each key: `allow` says if one more is fine. */
class RateLimiter {
  #limit;
  #windows = new Map();
  #now;

  constructor(limit, now) {
    this.#limit = limit;
    this.#now = now;
  }

  allow(key) {
    const now = this.#now();
    const window = this.#windows.get(key);
    if (!window || now - window.start >= 60_000) {
      this.#windows.set(key, { start: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= this.#limit;
  }

  /** Forgets the windows that ended, so the memory does not grow with every address ever seen. */
  clean() {
    const now = this.#now();
    for (const [key, window] of this.#windows) {
      if (now - window.start >= 60_000) {
        this.#windows.delete(key);
      }
    }
  }
}

/**
 * Makes the server. `options.dataDir` is where the blocks are kept, one file for each; `options.now`
 * gives the time in milliseconds and is there for the tests.
 */
export function createServer(options) {
  const config = { ...DEFAULTS, now: Date.now, ...options };
  const { dataDir, now } = config;
  const addressLimiter = new RateLimiter(config.perMinutePerAddress, now);
  const tokenLimiter = new RateLimiter(config.perMinutePerToken, now);
  /** Requests for the same block wait for the one before, so that reading and writing do not mix. */
  const queues = new Map();
  let count = null;

  const fileOf = (id) => join(dataDir, `${id}.json`);

  async function countBlobs() {
    if (count === null) {
      await mkdir(dataDir, { recursive: true });
      count = (await readdir(dataDir)).filter((name) => name.endsWith(".json")).length;
    }
    return count;
  }

  async function load(id) {
    try {
      return JSON.parse(await readFile(fileOf(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function store(id, record) {
    await mkdir(dataDir, { recursive: true });
    // Written to the side and then renamed, so that a crash never leaves half a block
    const temporary = join(dataDir, `${id}.${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, fileOf(id));
  }

  function serialized(id, task) {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.then(task, task);
    queues.set(id, next);
    const cleanup = () => queues.get(id) === next && queues.delete(id);
    next.then(cleanup, cleanup);
    return next;
  }

  /** Deletes the blocks that nobody has used for `ttlDays`. Returns how many it deleted. */
  async function sweep() {
    await countBlobs();
    let deleted = 0;
    for (const name of await readdir(dataDir)) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const id = name.slice(0, -".json".length);
      const record = await load(id).catch(() => null);
      const lastUse = Math.max(record?.updatedAt ?? 0, record?.accessedAt ?? 0);
      if (!record || now() - lastUse > config.ttlDays * DAY_MS) {
        await rm(fileOf(id), { force: true });
        count -= 1;
        deleted += 1;
      }
    }
    return deleted;
  }

  function clientAddress(request) {
    if (config.addressHeader) {
      // A list is read from the end: what a proxy adds is last, and what is before it was sent by the client
      const value = String(request.headers[config.addressHeader] ?? "")
        .split(",")
        .at(-1)
        .trim();
      if (value) {
        return value;
      }
    }
    return request.socket.remoteAddress ?? "unknown";
  }

  async function handleBlob(request, response, token) {
    const id = hashOf(token);

    if (request.method === "GET") {
      return serialized(id, async () => {
        const record = await load(id);
        if (!record) {
          return fail(response, 404, "not found");
        }
        // Reading counts as using it, but it is written at most once a day
        if (now() - (record.accessedAt ?? 0) > DAY_MS) {
          await store(id, { ...record, accessedAt: now() });
        }
        return sendJson(response, 200, record.block, { ETag: `"${record.rev}"` });
      });
    }

    if (request.method === "DELETE") {
      return serialized(id, async () => {
        const existed = await load(id);
        await rm(fileOf(id), { force: true });
        if (existed) {
          await countBlobs();
          count -= 1;
        }
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
      });
    }

    if (request.method === "PUT") {
      const ifMatch = request.headers["if-match"];
      if (typeof ifMatch !== "string" || !/^"\d{1,12}"$/.test(ifMatch)) {
        return fail(response, 428, 'send If-Match with the revision you saw, or "0" to create');
      }
      if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
        return fail(response, 415, "send application/json");
      }
      let block;
      try {
        block = JSON.parse(await readBody(request, config.maxBodyBytes));
      } catch (error) {
        if (error.status === 413) {
          // Answer, and only then hang up on a client that is still sending
          response.on("finish", () => request.destroy());
          return fail(response, 413, "too large", { Connection: "close" });
        }
        return fail(response, 400, "not json");
      }
      if (!validBlock(block)) {
        return fail(response, 400, "not a block");
      }
      const seen = Number(ifMatch.slice(1, -1));
      return serialized(id, async () => {
        const record = await load(id);
        const rev = record?.rev ?? 0;
        if (seen !== rev) {
          return fail(response, 412, "the block changed: read it again", { ETag: `"${rev}"` });
        }
        if (!record && (await countBlobs()) >= config.maxBlobs) {
          return fail(response, 507, "the server is full");
        }
        await store(id, { rev: rev + 1, updatedAt: now(), accessedAt: now(), block });
        if (!record) {
          count += 1;
        }
        return sendJson(response, record ? 200 : 201, { rev: rev + 1 }, { ETag: `"${rev + 1}"` });
      });
    }

    return fail(response, 405, "method not allowed", { Allow: "GET, PUT, DELETE" });
  }

  async function handle(request, response) {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (path === "/healthz") {
      return request.method === "GET"
        ? sendJson(response, 200, { ok: true })
        : fail(response, 405, "method not allowed");
    }
    if (path !== "/v1/blob") {
      return fail(response, 404, "not found");
    }
    if (!addressLimiter.allow(clientAddress(request))) {
      return fail(response, 429, "too many requests", { "Retry-After": "60" });
    }
    const match = /^Bearer (\S+)$/.exec(String(request.headers.authorization ?? ""));
    if (!match || !TOKEN.test(match[1])) {
      return fail(response, 401, "missing or malformed key");
    }
    if (!tokenLimiter.allow(match[1])) {
      return fail(response, 429, "too many requests", { "Retry-After": "60" });
    }
    return handleBlob(request, response, match[1]);
  }

  const server = createHttpServer((request, response) => {
    handle(request, response).catch((error) => {
      if (!response.headersSent) {
        fail(response, 500, "server error");
      }
      // Only what went wrong, never the request: it holds the key of someone
      console.error(`error: ${error.code ?? error.message}`);
    });
  });
  // Slow clients cannot hold a connection forever
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  return {
    server,
    sweep,
    clean: () => {
      addressLimiter.clean();
      tokenLimiter.clean();
    },
  };
}
