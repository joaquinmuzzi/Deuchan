import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  STREAMING_SITES,
  enabledSites,
  siteById,
  siteOfUrl,
  sitePermissions,
  siteScriptIds,
  siteScripts,
} from "../extension/src/sites.js";

const EXTENSION = resolve(dirname(fileURLToPath(import.meta.url)), "..", "extension");
const manifest = JSON.parse(readFileSync(resolve(EXTENSION, "manifest.json"), "utf8"));
const read = (file) => readFileSync(resolve(EXTENSION, file), "utf8");

test("the four sites, Netflix and Crunchyroll first", () => {
  assert.deepEqual(
    STREAMING_SITES.map((site) => site.id),
    ["netflix", "crunchyroll", "primevideo", "disneyplus"],
  );
  assert.equal(siteById("crunchyroll").name, "Crunchyroll");
  assert.equal(siteById("hulu"), null);
});

test("only the sites saved as on are on", () => {
  assert.deepEqual(enabledSites(undefined), []);
  assert.deepEqual(enabledSites({ netflix: true, crunchyroll: false, hulu: true, disneyplus: "yes" }), [
    "netflix",
  ]);
});

test("each site asks for its own pages only, inside what the manifest declares as optional", () => {
  for (const site of STREAMING_SITES) {
    const asked = sitePermissions(site);
    assert.deepEqual(asked.permissions, ["scripting"]);
    assert.ok(manifest.optional_permissions.includes("scripting"));
    for (const origin of asked.origins) {
      assert.match(origin, /^https:\/\/[a-z0-9.-]+\/\*$/, origin);
      // Granted at runtime as a part of <all_urls>: no new host in the manifest, no warning at install
      assert.ok(manifest.optional_host_permissions.includes("<all_urls>"));
      assert.ok(!(manifest.host_permissions ?? []).includes(origin));
    }
  }
});

test("each site registers its page script and the script that counts, on its pages", () => {
  for (const site of STREAMING_SITES) {
    const [bridge, content] = siteScripts(site);
    assert.deepEqual([bridge.id, content.id], siteScriptIds(site));
    assert.equal(bridge.world, "MAIN");
    assert.deepEqual(bridge.js, ["src/streaming-bridge.js"]);
    assert.deepEqual(content.js, ["src/streaming-content.js"]);
    assert.equal(content.world, undefined);
    for (const script of [bridge, content]) {
      assert.deepEqual(script.matches, site.origins);
      // Before the immersion profile's script, which then leaves the page alone
      assert.equal(script.runAt, "document_start");
      assert.equal(script.allFrames, Boolean(site.frames));
    }
  }
  // Crunchyroll's player is a frame of static.crunchyroll.com, which it asks for too
  const crunchyroll = siteById("crunchyroll");
  assert.equal(siteScripts(crunchyroll)[1].allFrames, true);
  for (const frame of crunchyroll.frames) {
    assert.ok(crunchyroll.origins.includes(`${frame}/*`));
  }
});

test("a page address finds its site by origin", () => {
  assert.equal(siteOfUrl("https://www.netflix.com/watch/82028220?trackId=1").id, "netflix");
  assert.equal(siteOfUrl("https://static.crunchyroll.com/vilos-v2/web/vilos/player.html").id, "crunchyroll");
  assert.equal(siteOfUrl("https://www.amazon.de/gp/video/detail/B0").id, "primevideo");
  assert.equal(siteOfUrl("https://www.disneyplus.com/play/x").id, "disneyplus");
  assert.equal(siteOfUrl("https://netflix.com.evil.example/watch/1"), null);
  assert.equal(siteOfUrl("not an address"), null);
});

test("what the counting script imports can be reached from every page it runs on, and nothing more", () => {
  const imported = (file) => [...read(file).matchAll(/getURL\("([^"]+)"\)/g)].map((match) => match[1]);
  // The modules it imports, and the ones they import in turn
  const needed = new Set();
  const visit = (file) => {
    for (const next of [
      ...imported(file),
      ...[...read(file).matchAll(/from "\.\/([^"]+)"/g)].map((match) => `src/${match[1]}`),
    ]) {
      if (!needed.has(next)) {
        needed.add(next);
        visit(next);
      }
    }
  };
  visit("src/streaming-content.js");
  const origins = STREAMING_SITES.flatMap((site) => site.origins);
  for (const origin of origins) {
    const reachable = manifest.web_accessible_resources
      .filter((entry) => entry.matches.includes(origin) || entry.matches.includes("<all_urls>"))
      .flatMap((entry) => entry.resources);
    for (const file of needed) {
      assert.ok(reachable.includes(file), `${file} on ${origin}`);
    }
  }
  const entry = manifest.web_accessible_resources.find((each) => each.resources.includes("src/streaming.js"));
  assert.deepEqual([...entry.resources].sort(), [...needed].sort());
  assert.deepEqual([...entry.matches].sort(), [...origins].sort());
});

test("the page script makes no request and never writes to the page", () => {
  const bridge = read("src/streaming-bridge.js");
  for (const call of ["fetch(", "XMLHttpRequest", "sendBeacon", "JSON.parse =", "innerHTML", ".click()"]) {
    assert.ok(!bridge.includes(call), call);
  }
});
