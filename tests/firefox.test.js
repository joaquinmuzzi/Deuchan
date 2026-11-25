import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { FIREFOX_MIN_VERSION, FIREFOX_NAME, GECKO_ID, firefoxManifest } from "../scripts/firefox.mjs";
import { EXTENSION, buildPackage, packageEntries } from "../scripts/package.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chromeManifest = () => JSON.parse(readFileSync(join(EXTENSION, "manifest.json"), "utf8"));

test("Firefox runs the background module as a background script, since it has no service worker", () => {
  const manifest = firefoxManifest(chromeManifest());
  assert.deepEqual(manifest.background, { scripts: ["src/background.js"], type: "module" });
  assert.equal(manifest.background.service_worker, undefined);
});

test("the Firefox manifest has an add-on id, a minimum version and says no data is collected", () => {
  const { browser_specific_settings: settings } = firefoxManifest(chromeManifest());
  assert.deepEqual(settings, {
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      data_collection_permissions: { required: ["none"] },
    },
  });
  // AMO keeps the id forever: it is an email-like id, and it must not change between versions
  assert.equal(GECKO_ID, "inputly@joaquinmuzzi.github.io");
  // 140: data_collection_permissions; the code needs 128 (world MAIN, optional_host_permissions)
  assert.ok(Number.parseFloat(FIREFOX_MIN_VERSION) >= 140);
});

test("the Firefox manifest leaves out what only Chrome reads, and keeps everything else as it is", () => {
  const chrome = chromeManifest();
  const firefox = firefoxManifest(chrome);
  assert.equal(firefox.minimum_chrome_version, undefined);
  const without = (manifest, keys) =>
    Object.fromEntries(Object.entries(manifest).filter(([key]) => !keys.includes(key)));
  // The name too may differ: it is shortened to what Firefox allows (see the test of the Firefox name)
  const rest = without(firefox, ["background", "browser_specific_settings", "name"]);
  const chromeRest = without(chrome, ["background", "minimum_chrome_version", "name"]);
  assert.deepEqual(rest, chromeRest, "permissions, content scripts, resources and version are the same");
  assert.equal(firefox.background.scripts[0], chrome.background.service_worker);
});

test("the Chrome manifest is not changed by making the Firefox one", () => {
  const chrome = chromeManifest();
  const before = structuredClone(chrome);
  firefoxManifest(chrome);
  assert.deepEqual(chrome, before);
});

test("a manifest without a service worker cannot be turned into a Firefox one", () => {
  assert.throws(() => firefoxManifest({ manifest_version: 3, background: { scripts: ["a.js"] } }));
  assert.throws(() => firefoxManifest({ manifest_version: 3 }));
});

test("the Firefox package has the same files as the Chrome one, and only the manifest differs", () => {
  const chrome = buildPackage(EXTENSION, "chrome");
  const firefox = buildPackage(EXTENSION, "firefox");
  const { version } = chromeManifest();
  assert.equal(chrome.name, `inputly-${version}.zip`);
  assert.equal(firefox.name, `inputly-firefox-${version}.zip`);
  assert.deepEqual(firefox.files, chrome.files);
  for (const [index, entry] of firefox.entries.entries()) {
    const same = entry.data.equals(chrome.entries[index].data);
    assert.equal(same, entry.name !== "manifest.json", entry.name);
  }
  const manifest = JSON.parse(firefox.entries.find((entry) => entry.name === "manifest.json").data);
  assert.deepEqual(manifest, firefoxManifest(chromeManifest()));
});

test("the Chrome package keeps the manifest byte for byte", () => {
  const manifest = packageEntries(EXTENSION, "chrome").find((entry) => entry.name === "manifest.json");
  assert.ok(manifest.data.equals(readFileSync(join(ROOT, "extension", "manifest.json"))));
});

test("the Firefox name points at the short message, as the longer Chrome name does not fit Firefox", () => {
  const chrome = chromeManifest();
  // The text of each locale is measured in locales.test.js
  assert.equal(firefoxManifest(chrome).name, FIREFOX_NAME);
  assert.equal(FIREFOX_NAME, "__MSG_extNameFirefox__");
  // A short literal name is kept as it is; a long one cannot be shortened by guessing, so it fails the build
  assert.equal(firefoxManifest({ ...chrome, name: "Inputly" }).name, "Inputly");
  assert.throws(() =>
    firefoxManifest({ ...chrome, name: "Inputly – Language Immersion Tracker for YouTube" }),
  );
});
