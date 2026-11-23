// Checks the Firefox build with Mozilla's own linter (`web-ext lint`, the one Firefox Add-ons runs on every
// upload): `npm run lint:firefox` makes `dist/firefox/` first. It fails on any error, and on any warning
// that is not in ALLOWED with the reason it can be ignored.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const ALLOWED = {
  // Firefox for Android only got `data_collection_permissions` in 142. Inputly is not offered for Android
  // (YouTube there is m.youtube.com, where the content script does not run), so it does not matter.
  KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION: "not offered for Firefox for Android",
};

const run = spawnSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "web-ext", "bin", "web-ext.js"),
    "lint",
    "--source-dir",
    "dist/firefox",
    "--output",
    "json",
  ],
  { cwd: ROOT, encoding: "utf8" },
);
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(run.stdout, run.stderr);
  process.exit(1);
}
const messages = [...report.errors, ...report.warnings, ...report.notices];
let failed = false;
for (const message of messages) {
  const allowed = message._type === "warning" && Object.hasOwn(ALLOWED, message.code);
  failed ||= message._type !== "notice" && !allowed;
  const note = allowed ? ` (allowed: ${ALLOWED[message.code]})` : "";
  console.log(`${message._type} ${message.code} in ${message.file ?? "?"}: ${message.description}${note}`);
}
console.log(
  `web-ext lint: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.notices} notices`,
);
process.exit(failed ? 1 : 0);
