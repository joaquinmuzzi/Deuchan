// Starts the sync server: `node server/index.js`. It is configured with the environment:
// PORT (default 3000), DATA_DIR (where the blocks are kept; on the host, a volume).
import { createServer, DEFAULTS } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? "./data";
const options = { dataDir };
for (const [variable, name] of [
  ["MAX_BLOBS", "maxBlobs"],
  ["TTL_DAYS", "ttlDays"],
  ["PROXY_HOPS", "proxyHops"],
]) {
  if (process.env[variable] !== undefined) {
    options[name] = Number(process.env[variable]);
  }
}

const app = createServer(options);

await app.sweep();
// Old blocks go once a day, and the counters of the limits are cleaned every minute
setInterval(
  () => app.sweep().catch((error) => console.error(`sweep: ${error.code ?? error.message}`)),
  24 * 3600 * 1000,
).unref();
setInterval(app.clean, 60_000).unref();

app.server.listen(port, "0.0.0.0", () => {
  console.log(`Deuchan sync listening on ${port} (blocks kept ${options.ttlDays ?? DEFAULTS.ttlDays} days)`);
});

// The host stops the server with SIGTERM when it deploys a new version
process.on("SIGTERM", () => app.server.close(() => process.exit(0)));
