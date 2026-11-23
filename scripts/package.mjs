// Makes the zips that are uploaded to the stores, with what is in `extension/`, and only that: the tests,
// the server and the docs are not part of them.
//
// - `npm run package` writes `dist/inputly-<version>.zip`, for the Chrome Web Store and Edge Add-ons.
// - `npm run package:firefox` writes `dist/inputly-firefox-<version>.zip`, for Firefox Add-ons: the same
//   files with the manifest of firefox.mjs. It also leaves them unpacked in `dist/firefox/`, which
//   `about:debugging` can load and `npm run lint:firefox` checks.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { firefoxManifest } from "./firefox.mjs";
import { createZip } from "./zip.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EXTENSION = join(ROOT, "extension");

/** The browsers there is a build for: the zip name and how the manifest is changed for each. */
export const TARGETS = {
  chrome: { prefix: "inputly", manifest: (manifest) => manifest },
  firefox: { prefix: "inputly-firefox", manifest: firefoxManifest },
};

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

/** The contents of every file of the package for `target`: the extension's, with that browser's manifest. */
export function packageEntries(directory = EXTENSION, target = "chrome") {
  const { manifest: change } = TARGETS[target];
  return collectFiles(directory).map((name) => {
    if (name !== "manifest.json") {
      return { name, data: readFileSync(join(directory, name)) };
    }
    const manifest = JSON.parse(readFileSync(join(directory, name), "utf8"));
    // The Chrome manifest goes byte for byte as it is; only a changed one is written again
    const data =
      target === "chrome"
        ? readFileSync(join(directory, name))
        : Buffer.from(`${JSON.stringify(change(manifest), null, 2)}\n`);
    return { name, data };
  });
}

/** The package: its name, its files and its bytes. */
export function buildPackage(directory = EXTENSION, target = "chrome") {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  const entries = packageEntries(directory, target);
  return {
    name: `${TARGETS[target].prefix}-${manifest.version}.zip`,
    files: entries.map((entry) => entry.name),
    entries,
    bytes: createZip(entries),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv.includes("--firefox") ? "firefox" : "chrome";
  const { name, files, entries, bytes } = buildPackage(EXTENSION, target);
  const folder = join(ROOT, "dist");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), bytes);
  console.log(`Wrote dist/${name}: ${files.length} files, ${(bytes.length / 1024).toFixed(1)} KB`);
  if (target !== "chrome") {
    const unpacked = join(folder, target);
    rmSync(unpacked, { recursive: true, force: true });
    for (const entry of entries) {
      mkdirSync(dirname(join(unpacked, entry.name)), { recursive: true });
      writeFileSync(join(unpacked, entry.name), entry.data);
    }
    console.log(`Wrote dist/${target}/, the same files unpacked`);
  }
}
