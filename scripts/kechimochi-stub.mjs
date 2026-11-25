// A stand-in for Kechimochi's HTTP API (tests/kechimochi-stub.js) as a real server, to try "Send to
// Kechimochi" in a browser where Kechimochi is not installed: `node scripts/kechimochi-stub.mjs [port]`.
// Like Kechimochi in local mode, it listens on 127.0.0.1 only and refuses another Host header with a 403. It
// adds CORS headers only for the origins in KECHIMOCHI_ORIGINS (comma separated), as Kechimochi's "Allowed
// Browser Origins" does, and prints every request with its Origin header.
import { createServer } from "node:http";

import { createKechimochiStub } from "../tests/kechimochi-stub.js";

const port = Number(process.argv[2] ?? 3031);
const allowedOrigins = (process.env.KECHIMOCHI_ORIGINS ?? "").split(",").filter(Boolean);
const stub = createKechimochiStub({ allowedOrigins });
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(:\d+)?$/;

createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const origin = request.headers.origin;
    const cors = stub.corsHeaders(origin);
    console.log(`${request.method} ${request.url} Origin: ${origin ?? "(none)"}`);
    if (!LOOPBACK.test(request.headers.host ?? "")) {
      response.writeHead(403, { "Content-Type": "text/plain" });
      response.end("Host header is not allowed for the local Kechimochi API");
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(cors["Access-Control-Allow-Origin"] ? 200 : 204, cors);
      response.end();
      return;
    }
    const answer = stub.handle({
      method: request.method,
      path: new URL(request.url, "http://localhost").pathname,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, String(value)]),
      ),
      body,
    });
    response.writeHead(answer.status, { "Content-Type": answer.type, ...cors });
    response.end(answer.body);
  });
}).listen(port, "127.0.0.1", () => console.log(`Kechimochi stub on http://127.0.0.1:${port}`));
