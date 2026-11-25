// The package declares locales so that each store language gets its own listing: the stores take the name
// and the summary of each language from `_locales/`. Only these store strings are translated; the pages of
// the extension are in English.
import assert from "node:assert/strict";
import { test } from "node:test";

import { FIREFOX_NAME_MAX, firefoxManifest } from "../scripts/firefox.mjs";
import { LOCALES, listingOf, localize, messagesOf, readManifest } from "./locales.js";

const manifest = readManifest();

test("the name and the summary come from the messages, English by default", () => {
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extName__");
  assert.equal(manifest.description, "__MSG_extDescription__");
  assert.deepEqual(LOCALES, ["en", "es"]);
});

test("the English name and summary are the ones the listing had before it was translated", () => {
  assert.deepEqual(listingOf("en"), {
    name: "Inputly – Language Immersion Tracker for YouTube & Netflix",
    description:
      "Counts your input hours in any language on YouTube, Netflix and Crunchyroll. Daily goal, streak, private, no account.",
  });
});

test("every locale has the same keys, and each name and summary fits the store limits", () => {
  const keys = Object.keys(messagesOf("en")).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(messagesOf(locale)).sort(), keys, locale);
    const { name, description } = listingOf(locale);
    assert.ok(name.startsWith("Inputly – "), `${locale}: ${name}`);
    assert.ok(name.length <= 75, `${locale}: the name has ${name.length} characters`);
    assert.ok(
      description.length > 0 && description.length <= 132,
      `${locale}: the summary has ${description.length}`,
    );
    assert.doesNotMatch(name + description, /__MSG_/, locale);
  }
});

test("the Firefox name is a message too, and fits the 45 characters Firefox allows in every locale", () => {
  const firefox = firefoxManifest(manifest);
  for (const locale of LOCALES) {
    const name = localize(firefox.name, locale);
    assert.ok(name.startsWith("Inputly"), `${locale}: ${name}`);
    assert.ok(name.length <= FIREFOX_NAME_MAX, `${locale}: ${name} has ${name.length} characters`);
  }
  assert.equal(localize(firefox.description, "es"), listingOf("es").description);
});
