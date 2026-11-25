// The listing of the Chrome Web Store has to say what the extension really does. These tests fail if a
// permission is added without its justification, if the summary and the manifest differ, or if an image
// is not the size the store asks for.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { listingOf } from "./locales.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// On Windows git checks files out with CRLF line endings, and the patterns below look for LF
const read = (file) => readFileSync(resolve(ROOT, file), "utf8").replaceAll("\r\n", "\n");
const manifest = JSON.parse(read("extension/manifest.json"));
const listing = read("docs/store-listing.md");
const policy = read("PRIVACY.md");

/** The width and the height of a JPEG, from its first "start of frame" marker. */
function jpegSize(path) {
  const bytes = readFileSync(resolve(ROOT, path));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8, `${path} is a JPEG`);
  let position = 2;
  while (position < bytes.length) {
    assert.equal(bytes[position], 0xff, "a marker");
    const marker = bytes[position + 1];
    const length = bytes.readUInt16BE(position + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return { height: bytes.readUInt16BE(position + 5), width: bytes.readUInt16BE(position + 7) };
    }
    position += 2 + length;
  }
  throw new Error(`no size in ${path}`);
}

test("the name of the listing is the name of the manifest, and fits the 75 characters", () => {
  const name = /\*\*Name:\*\* (.+)\n/.exec(listing)?.[1];
  assert.equal(name, listingOf("en").name);
  assert.ok(name.length <= 75);
});

test("the summary of the listing is the description of the manifest, and fits the 132 characters", () => {
  const summary = /\*\*Summary\*\*[^\n]*\n\n> (.+)\n/.exec(listing)?.[1];
  assert.ok(summary, "the listing has a summary");
  assert.equal(summary, listingOf("en").description);
  assert.ok(summary.length <= 132);
});

test("every permission of the manifest is justified in the listing", () => {
  for (const permission of manifest.permissions) {
    assert.match(listing, new RegExp(`\\| \`${permission}\`\\s+\\|`), `${permission} has a row in the table`);
  }
  for (const host of [...(manifest.host_permissions ?? []), ...(manifest.optional_host_permissions ?? [])]) {
    assert.ok(listing.includes(`\`${host}\``), `${host} is justified`);
  }
  for (const script of manifest.content_scripts) {
    for (const match of script.matches) {
      assert.ok(listing.includes(`\`${match}\``), `${match} is justified`);
    }
  }
});

test("every optional permission is justified in the listing and in the policy", () => {
  for (const permission of manifest.optional_permissions ?? []) {
    assert.ok(listing.includes(`\`${permission}\``), `${permission} is justified`);
    assert.ok(policy.includes(`\`${permission}\``), `${permission} is in the policy`);
  }
});

test("the policy says what has to be said about Mosaik, the immersion profile and retention", () => {
  for (const text of [
    "Send to Mosaik",
    "device token",
    "The immersion profile",
    "Reading counted by hand",
    "IP address",
    "How long the data is kept",
    "Chrome Web Store User Data Policy",
  ]) {
    assert.ok(policy.includes(text), text);
  }
  assert.match(policy, /_Last updated: \d{1,2} [A-Z][a-z]+ \d{4}\._/);
});

test("the listing links to the policy, and the manifest says where the project is", () => {
  assert.ok(listing.includes("blob/main/PRIVACY.md"));
  assert.equal(manifest.homepage_url, "https://github.com/joaquinmuzzi/inputly");
});

test("the description fits what the store allows, and does not claim to be YouTube", () => {
  const description = /\*\*Description:\*\*\n\n```\n([\s\S]+?)\n```/.exec(listing)?.[1];
  assert.ok(description, "the listing has a description");
  assert.ok(description.length <= 16_000);
  assert.ok(description.includes("not affiliated with, endorsed by or sponsored by YouTube"));
});

test("the screenshots are 1280 x 800 and the small tile is 440 x 280", () => {
  const screenshots = [
    "docs/store/screenshot-1-streaming.jpg",
    "docs/store/screenshot-2-day-videos.jpg",
    "docs/store/screenshot-3-popup.jpg",
    "docs/store/screenshot-4-dashboard-dark.jpg",
    "docs/store/screenshot-5-language.jpg",
  ];
  assert.ok(screenshots.length >= 1 && screenshots.length <= 5, "the store takes from 1 to 5");
  for (const path of screenshots) {
    assert.deepEqual(jpegSize(path), { width: 1280, height: 800 }, path);
    assert.ok(listing.includes(path.replace("docs/", "")), `${path} is in the listing`);
  }
  assert.deepEqual(jpegSize("docs/store/promo-small-440x280.jpg"), { width: 440, height: 280 });
});

/** The Spanish name, summary and description of the listing. */
function spanishListing() {
  const name = /\*\*Name \(es\):\*\* (.+)\n/.exec(listing)?.[1];
  const summary = /\*\*Summary \(es\)\*\*[^\n]*\n\n> (.+)\n/.exec(listing)?.[1];
  const description = /\*\*Description \(es\):\*\*\n\n```\n([\s\S]+?)\n```/.exec(listing)?.[1];
  assert.ok(name && summary && description, "the listing has a Spanish name, summary and description");
  return { name, summary, description };
}

test("the Spanish name and summary of the listing are the ones of the package's Spanish messages", () => {
  const { name, summary } = spanishListing();
  assert.deepEqual({ name, description: summary }, listingOf("es"));
});

test("the Spanish description says first that the pages are in English, and is as honest as the English one", () => {
  const { description } = spanishListing();
  const text = description.replaceAll(/\s+/g, " ");
  assert.ok(description.length <= 16_000);
  assert.match(description, /^La interfaz de la extensión está en inglés por ahora\./);
  assert.ok(text.includes("salvo que actives la exportación opcional a Mosaik"));
  assert.ok(text.includes("Sin registro, sin anuncios, sin analíticas, sin rastreadores."));
  assert.ok(text.includes("No está afiliado a YouTube, Netflix ni Crunchyroll"));
});

test("no search keyword appears more than 5 times in the Spanish listing (store spam policy)", () => {
  const { name, summary, description } = spanishListing();
  const text = `${name} ${summary} ${description}`.toLowerCase();
  const keywords = [
    "inmersión",
    "idioma",
    "idiomas",
    "horas",
    "input",
    "contador",
    "youtube",
    "netflix",
    "crunchyroll",
  ];
  for (const keyword of keywords) {
    // Whole words only: "input" is not counted inside "Inputly"
    const uses = text.match(new RegExp(`(?<!\\p{L})${keyword}(?!\\p{L})`, "gu"))?.length ?? 0;
    assert.ok(uses <= 5, `"${keyword}" appears ${uses} times`);
  }
});
