import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { IMMERSION_PERMISSIONS, immersionScript } from "../extension/src/immersion.js";

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

const importsOf = (file) => [
  ...readFileSync(resolve(EXTENSION, file), "utf8").matchAll(/getURL\("([^"]+)"\)/g),
];

test("every file the manifest names exists", () => {
  for (const file of files) {
    assert.ok(existsSync(resolve(EXTENSION, file)), file);
  }
});

test("it is Manifest V3", () => {
  assert.equal(manifest.manifest_version, 3);
});

test("it asks only for what shows no warning at install, and runs on YouTube only", () => {
  // None of these shows a warning when the extension is installed
  assert.deepEqual(manifest.permissions, ["storage", "alarms", "idle", "activeTab"]);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ["https://www.youtube.com/*"]);
  }
});

test("it may talk to no address at all until the person allows one", () => {
  assert.equal(manifest.host_permissions, undefined);
});

test("the hub on this computer, a Mosaik server and the immersion profile are optional permissions", () => {
  // Asked for from the dashboard: a new permission in host_permissions would show a warning to every
  // person who has the extension. https://*/* is never asked for whole: only the host of the server set
  assert.deepEqual(manifest.optional_host_permissions, [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://*/*",
    "<all_urls>",
  ]);
});

test("the immersion profile asks for optional permissions only, the same that the code asks for", () => {
  assert.deepEqual(manifest.optional_permissions, IMMERSION_PERMISSIONS.permissions);
  for (const origin of IMMERSION_PERMISSIONS.origins) {
    assert.ok(manifest.optional_host_permissions.includes(origin), origin);
  }
  for (const file of immersionScript().js) {
    assert.ok(existsSync(resolve(EXTENSION, file)), file);
  }
  // What the script of every site imports can be reached from any site, and nothing more
  const everywhere = manifest.web_accessible_resources
    .filter((entry) => entry.matches.includes("<all_urls>"))
    .flatMap((entry) => entry.resources);
  const imported = importsOf("src/generic.js");
  assert.ok(imported.length > 0);
  for (const [, file] of imported) {
    assert.ok(everywhere.includes(file), file);
  }
  assert.deepEqual(everywhere.sort(), ["src/tracker.js", "src/watcher.js"]);
});

test("the modules the content script imports can be reached from the page", () => {
  const imported = importsOf("src/content.js");
  const reachable = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.ok(imported.length > 0);
  for (const [, file] of imported) {
    assert.ok(reachable.includes(file), file);
  }
});

test("the modules those modules import can be reached too", () => {
  for (const entry of manifest.web_accessible_resources) {
    for (const file of entry.resources) {
      const source = readFileSync(resolve(EXTENSION, file), "utf8");
      for (const [, name] of source.matchAll(/from "\.\/([^"]+)"/g)) {
        assert.ok(entry.resources.includes(`src/${name}`), `${file} imports ${name}`);
      }
    }
  }
});

test("the manifest and the package have the same name", () => {
  // The manifest name is the store name, "Inputly – Track your language input": its first word is the name
  assert.equal(manifest.name.split(" ")[0].toLowerCase(), packageJson.name);
  assert.equal(manifest.action.default_title, "Inputly");
});

test("the name fits what the Chrome Web Store allows", () => {
  assert.ok(manifest.name.length <= 75, `${manifest.name.length} characters`);
});
