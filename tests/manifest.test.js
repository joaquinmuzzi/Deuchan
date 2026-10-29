import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { SYNC_URL } from "../extension/src/sync-config.js";

const EXTENSION = resolve(dirname(fileURLToPath(import.meta.url)), "..", "extension");
const manifest = JSON.parse(readFileSync(resolve(EXTENSION, "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(resolve(EXTENSION, "..", "package.json"), "utf8"));

const files = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
  ...(manifest.action?.default_popup ? [manifest.action.default_popup] : []),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
];

test("every file the manifest names exists", () => {
  for (const file of files) {
    assert.ok(existsSync(resolve(EXTENSION, file)), file);
  }
});

test("it is Manifest V3", () => {
  assert.equal(manifest.manifest_version, 3);
});

test("it asks for storage and alarms only, and runs on YouTube only", () => {
  assert.deepEqual(manifest.permissions, ["storage", "alarms"]);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ["https://www.youtube.com/*"]);
  }
});

test("the only address it may talk to is the sync server, and it is the one the code uses", () => {
  assert.deepEqual(manifest.host_permissions, [`${SYNC_URL}/*`]);
  assert.match(SYNC_URL, /^https:\/\/[a-z0-9.-]+$/, "https, and no path");
});

test("the modules the content script imports can be reached from the page", () => {
  const imported = [
    ...readFileSync(resolve(EXTENSION, "src/content.js"), "utf8").matchAll(/getURL\("([^"]+)"\)/g),
  ];
  const reachable = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(imported.length > 0);
  for (const [, file] of imported) {
    assert.ok(reachable.includes(file), file);
  }
});

test("the modules those modules import can be reached too", () => {
  const reachable = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  for (const file of reachable) {
    const source = readFileSync(resolve(EXTENSION, file), "utf8");
    for (const [, name] of source.matchAll(/from "\.\/([^"]+)"/g)) {
      assert.ok(reachable.includes(`src/${name}`), `${file} imports ${name}`);
    }
  }
});

test("the manifest and the package have the same name", () => {
  assert.equal(manifest.name.toLowerCase(), packageJson.name);
});
