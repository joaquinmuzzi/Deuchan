/**
 * A small Kechimochi HTTP API in memory, as its `docs/http-api.md` and its source (`src-tauri/src/http_api.rs`,
 * v0.3.3) describe it: the routes "Send to Kechimochi" uses, the checks that matter to it, and the answers
 * it gets. Used by the tests as `fetch`, and by `scripts/kechimochi-stub.mjs` as a real server, to try the
 * extension in a browser when Kechimochi itself is not installed.
 *
 * - `GET /api/version` answers `"http-0.3.3"`
 * - a mutation that is not JSON needs `X-Kechimochi-API: 1` (403 otherwise)
 * - media: a blank title is a 400, an exact (title, variant) pair taken is a 409; the variant is trimmed
 * - logs: a log with no minutes and no characters is a 400, an unknown media id is a 400, a PUT to an
 *   unknown log is a 400 ("Activity N not found"), a DELETE always succeeds
 * - errors are plain text; CORS headers only for an origin in `allowedOrigins`, and a request is never
 *   refused for its Origin
 */
const ACTIVITY_TYPES = new Set(["Reading", "Watching", "Playing", "Listening", "None", ""]);

export function createKechimochiStub({ allowedOrigins = [] } = {}) {
  const media = [];
  const logs = [];
  const requests = [];
  let nextMedia = 1;
  let nextLog = 1;
  let down = false;

  const json = (value, status = 200) => ({ status, type: "application/json", body: JSON.stringify(value) });
  const text = (body, status) => ({ status, type: "text/plain; charset=utf-8", body });

  function logOf(body) {
    if (!(body.duration_minutes > 0) && !(body.characters > 0)) {
      return text("Activity must have either duration or characters", 400);
    }
    if (!media.some((entry) => entry.id === body.media_id)) {
      return text(`Media ${body.media_id} not found`, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return text("Activity date must be YYYY-MM-DD", 400);
    }
    if (!ACTIVITY_TYPES.has(body.activity_type ?? "")) {
      return text("Invalid activity type", 400);
    }
    return null;
  }

  /** One request: `{ method, path, headers, body }` → `{ status, type, body }`. */
  function handle({ method, path, headers = {}, body = "" }) {
    const header = (name) => headers[name] ?? headers[name.toLowerCase()];
    const isJson = /^application\/json/i.test(header("Content-Type") ?? "");
    requests.push({ method, path });
    if (["POST", "PUT", "DELETE"].includes(method) && !isJson && header("X-Kechimochi-API") !== "1") {
      return text("Non-JSON mutations require the X-Kechimochi-API: 1 header", 403);
    }
    const data = isJson && body ? JSON.parse(body) : null;
    if (method === "GET" && path === "/api/version") {
      return json("http-0.3.3");
    }
    if (path === "/api/media") {
      if (method === "GET") {
        return json(media);
      }
      if (method === "POST") {
        if (!String(data.title ?? "").trim()) {
          return text("Media title cannot be blank", 400);
        }
        const variant = String(data.variant ?? "").trim();
        if (media.some((entry) => entry.title === data.title && entry.variant === variant)) {
          return text(`Another media entry already uses title ${data.title}`, 409);
        }
        const entry = { ...data, variant, id: nextMedia++, uid: `uid-${nextMedia}` };
        media.push(entry);
        return json(entry.id);
      }
    }
    if (path === "/api/logs") {
      if (method === "GET") {
        return json(
          logs.map((log) => {
            const entry = media.find((each) => each.id === log.media_id);
            return { ...log, title: entry.title, language: entry.language };
          }),
        );
      }
      if (method === "POST") {
        const refused = logOf(data);
        if (refused) {
          return refused;
        }
        const log = {
          id: nextLog++,
          media_id: data.media_id,
          duration_minutes: data.duration_minutes,
          characters: data.characters ?? 0,
          date: data.date,
          date_precision: data.date_precision ?? "day",
          activity_type: data.activity_type ?? "",
          notes: data.notes ?? "",
        };
        logs.push(log);
        return json(log.id);
      }
    }
    const one = /^\/api\/logs\/(\d+)$/.exec(path);
    if (one) {
      const id = Number(one[1]);
      const index = logs.findIndex((log) => log.id === id);
      if (method === "PUT") {
        const refused = logOf(data);
        if (refused) {
          return refused;
        }
        if (index < 0) {
          return text(`Activity ${id} not found`, 400);
        }
        logs[index] = { ...logs[index], ...data, id };
        return json(null);
      }
      if (method === "DELETE") {
        if (index >= 0) {
          logs.splice(index, 1);
        }
        return json(null);
      }
    }
    return text("API route not found", 404);
  }

  /** `fetch` for the tests: what a background script with the host permission gets. */
  async function fetchImpl(url, init = {}) {
    if (down) {
      throw new TypeError("Failed to fetch");
    }
    const { pathname } = new URL(url);
    const answer = handle({
      method: init.method ?? "GET",
      path: pathname,
      headers: init.headers ?? {},
      body: init.body ?? "",
    });
    return new Response(answer.body, { status: answer.status, headers: { "Content-Type": answer.type } });
  }

  /** The CORS headers Kechimochi adds to an answer for that Origin (none unless it is allowed). */
  const corsHeaders = (origin) =>
    origin && allowedOrigins.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE",
          "Access-Control-Allow-Headers": "content-type,x-kechimochi-api",
        }
      : {};

  return {
    media,
    logs,
    requests,
    handle,
    corsHeaders,
    fetch: fetchImpl,
    setDown(value) {
      down = value;
    },
  };
}
