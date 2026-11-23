import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TARGET,
  TARGET_HASH,
  TARGET_KEY,
  TARGET_LANGUAGES,
  isTarget,
  languageName,
  normalizeLanguage,
  targetName,
  targetOf,
  targetOptions,
} from "../extension/src/target.js";

test("the default target is German, so whoever used Deuchan before the setting notices nothing", () => {
  assert.equal(DEFAULT_TARGET, "de");
  assert.equal(targetOf(undefined), "de");
  assert.equal(TARGET_KEY, "targetLanguage");
  assert.equal(TARGET_HASH, "#language");
});

test("normalizeLanguage keeps only the language of a tag, in lower case", () => {
  assert.equal(normalizeLanguage("de"), "de");
  assert.equal(normalizeLanguage("de-AT"), "de");
  assert.equal(normalizeLanguage("DE"), "de");
  assert.equal(normalizeLanguage("pt_BR"), "pt");
  assert.equal(normalizeLanguage(" ja "), "ja");
  assert.equal(normalizeLanguage("zh-Hant-TW"), "zh");
  assert.equal(normalizeLanguage("zh-Hans"), "zh");
  assert.equal(normalizeLanguage("yue"), "yue");
});

test("normalizeLanguage replaces the deprecated codes YouTube still uses", () => {
  assert.equal(normalizeLanguage("iw"), "he");
  assert.equal(normalizeLanguage("in"), "id");
  assert.equal(normalizeLanguage("ji"), "yi");
});

test("normalizeLanguage rejects what is not a known language", () => {
  for (const tag of [undefined, null, 42, "", "  ", "und", "xx", "german", "de--AT", {}]) {
    assert.equal(normalizeLanguage(tag), null, String(tag));
  }
});

test("targetOf keeps a usable saved language and falls back to German otherwise", () => {
  assert.equal(targetOf("ja"), "ja");
  assert.equal(targetOf("es-419"), "es");
  assert.equal(targetOf("xx"), "de");
  assert.equal(targetOf(null), "de");
  assert.equal(targetOf({ code: "ja" }), "de");
});

test("isTarget compares any tag with the target, whatever its region or script", () => {
  assert.ok(isTarget("de-DE", "de"));
  assert.ok(isTarget("ja", "ja"));
  assert.ok(isTarget("zh-TW", "zh"));
  assert.ok(isTarget("iw", "he"));
  assert.ok(!isTarget("en", "de"));
  assert.ok(!isTarget(undefined, "de"));
  // A target that was never set is German
  assert.ok(isTarget("de", undefined));
});

test("languageName says the language in English, or in another locale", () => {
  assert.equal(languageName("de"), "German");
  assert.equal(languageName("ja-JP"), "Japanese");
  assert.equal(languageName("zh"), "Chinese");
  assert.equal(languageName("de", "es"), "alemán");
  // Something that is not a language is shown as it is, rather than as nothing
  assert.equal(languageName("xx"), "xx");
});

test("targetName is the name of the saved target, German while nothing usable is saved", () => {
  assert.equal(targetName(undefined), "German");
  assert.equal(targetName("not a language"), "German");
  assert.equal(targetName("ja"), "Japanese");
  assert.equal(targetName("pt-BR"), "Portuguese");
  assert.equal(targetName("de", "es"), "alemán");
});

test("the offered languages are valid, bare codes, German and the most learned among them", () => {
  for (const code of TARGET_LANGUAGES) {
    assert.equal(normalizeLanguage(code), code);
  }
  for (const code of ["de", "en", "es", "fr", "it", "ja", "ko", "pt", "ru", "zh"]) {
    assert.ok(TARGET_LANGUAGES.includes(code), code);
  }
  assert.equal(new Set(TARGET_LANGUAGES).size, TARGET_LANGUAGES.length);
});

test("targetOptions lists the offered languages by name", () => {
  const options = targetOptions(undefined);
  assert.equal(options.length, TARGET_LANGUAGES.length);
  const names = options.map(({ name }) => name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, "en")),
  );
  assert.deepEqual(
    options.find(({ code }) => code === "ko"),
    { code: "ko", name: "Korean" },
  );
});

test("targetOptions keeps a saved language that is not offered", () => {
  const options = targetOptions("yue");
  assert.equal(options.length, TARGET_LANGUAGES.length + 1);
  assert.ok(options.some(({ code, name }) => code === "yue" && name === "Cantonese"));
});
