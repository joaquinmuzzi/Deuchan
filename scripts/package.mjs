// Makes the zip that is uploaded to the Chrome Web Store: `npm run package` writes `dist/deuchan-<version>.zip`
// with what is in `extension/`, and only that: the tests, the server and the docs are not part of it.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createZip } from "./zip.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EXTENSION = join(ROOT, "extension");

/** Files that a machine leaves behind and that do not belong in a package. */
const IGNORED = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** The paths of the files under `directory`, relative to it, with `/`, in alphabetical order. */
export function collectFiles(directory = EXTENSION, prefix = "") {
  const found = [];
  for (const entry of readdirSync(directory).sort()) {
    if (IGNORED.has(entry) || entry.startsWith(".")) {
      continue;
    }
    const full = join(directory, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, relative));
    } else {
      found.push(relative);
    }
  }
  return found;
}

/** The package: its name, its files and its bytes. */
export function buildPackage(directory = EXTENSION) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  const files = collectFiles(directory);
  const bytes = createZip(files.map((name) => ({ name, data: readFileSync(join(directory, name)) })));
  return { name: `deuchan-${manifest.version}.zip`, files, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { name, files, bytes } = buildPackage();
  const folder = join(ROOT, "dist");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), bytes);
  console.log(`Wrote dist/${name}: ${files.length} files, ${(bytes.length / 1024).toFixed(1)} KB`);
}
