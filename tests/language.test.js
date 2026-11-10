import assert from "node:assert/strict";
import { test } from "node:test";

import { audioLanguage, detectGerman, germanScore, isGermanCode } from "../extension/src/language.js";

test("isGermanCode accepts German variants and nothing else", () => {
  for (const code of ["de", "de-DE", "de-AT", "DE", "de_CH"]) {
    assert.equal(isGermanCode(code), true, code);
  }
  for (const code of ["en", "es", "deu", "dk", "", undefined]) {
    assert.equal(isGermanCode(code), false, String(code));
  }
});

test("automatic German captions mean German", () => {
  const video = { captionTracks: [{ languageCode: "de", kind: "asr" }] };
  assert.deepEqual(detectGerman(video), { german: true, reason: "automatic-captions" });
});

test("automatic captions in another language mean not German, whatever the title says", () => {
  const video = {
    captionTracks: [{ languageCode: "en", kind: "asr" }],
    title: "Das ist nicht mein Tag und ich habe keine Lust",
  };
  assert.deepEqual(detectGerman(video), { german: false, reason: "automatic-captions" });
});

test("uploaded German captions alone do not decide: they may be a translation", () => {
  const video = { captionTracks: [{ languageCode: "de" }], title: "How to bake bread at home" };
  assert.equal(detectGerman(video).german, false);
});

test("a German title and description are German when there are no automatic captions", () => {
  const video = {
    title: "Ich lerne Deutsch mit Musik",
    description: "In diesem Video sprechen wir über das Wetter und wie es heute in Berlin ist.",
  };
  assert.deepEqual(detectGerman(video), { german: true, reason: "text" });
});

test("English, Spanish and French texts are not German", () => {
  const texts = [
    "How to learn a language fast: the only guide you need and why it works",
    "Cómo aprender idiomas rápido, la guía que necesitas para empezar hoy",
    "Comment apprendre une langue avec des séries et des chansons",
  ];
  for (const title of texts) {
    assert.equal(detectGerman({ title, description: title }).german, false, title);
  }
});

test("an empty video is not German", () => {
  assert.deepEqual(detectGerman({}), { german: false, reason: "none" });
});

test("one German word in an English title is not enough", () => {
  assert.equal(
    detectGerman({ title: "Why I moved to Berlin and what I did not expect, mit Humor" }).german,
    false,
  );
});

test("germanScore counts function words and umlauts", () => {
  assert.deepEqual(germanScore(""), { hits: 0, share: 0 });
  assert.equal(germanScore("und der das").hits, 3);
  assert.equal(germanScore("Müller Straße").hits, 2);
});

/** The id of an audio track as the player gives it: the itag, and the tags in base64 without padding. */
function audioId(content, lang) {
  const text = `\n\x14\n\x05acont\x12${String.fromCharCode(content.length)}${content}\n\r\n\x04lang\x12${String.fromCharCode(lang.length)}${lang}`;
  return `251;${btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

test("audioLanguage reads the language of the track that is playing, as the player gives it", () => {
  // taken from a real video: the Spanish automatic dubbing
  assert.equal(audioLanguage("251;ChQKBWFjb250EgtkdWJiZWQtYXV0bwoNCgRsYW5nEgVlcy1VUw"), "es-US");
  assert.equal(audioLanguage(audioId("original", "en-US")), "en-US");
  assert.equal(audioLanguage(audioId("dubbed-auto", "de-DE")), "de-DE");
  assert.equal(audioLanguage(audioId("original", "de")), "de");
  for (const none of ["251;", "140", "", null, undefined, 5, "251;!!!", "251;AAAA"]) {
    assert.equal(audioLanguage(none), null, String(none));
  }
});

// What YouTube gives for a video with automatic dubbing: captions in every language of the dubbing
const manyAutomatic = ["de", "ar", "bn", "ko", "es", "fr", "en", "ja"].map((languageCode) => ({
  languageCode,
  kind: "asr",
}));

test("an English video with automatic German captions among many is not German if the audio is Spanish or English", () => {
  const english = { title: "The Game That Changed Horror FOREVER", description: "NEW GAME. Hope you Enjoy!" };
  for (const audioTrackId of [audioId("dubbed-auto", "es-US"), audioId("original", "en-US")]) {
    assert.deepEqual(detectGerman({ ...english, captionTracks: manyAutomatic, audioTrackId }), {
      german: false,
      reason: "audio",
    });
  }
  // and without knowing the audio, so many automatic captions say nothing about the language
  assert.equal(detectGerman({ ...english, captionTracks: manyAutomatic }).german, false);
});

test("the audio that is heard decides: an English video dubbed into German is German, a German one dubbed into Spanish is not", () => {
  const dubbedIntoGerman = detectGerman({
    captionTracks: manyAutomatic,
    audioTrackId: audioId("dubbed-auto", "de-DE"),
    title: "An English title",
  });
  assert.deepEqual(dubbedIntoGerman, { german: true, reason: "audio" });
  const germanDubbedIntoSpanish = detectGerman({
    captionTracks: [{ languageCode: "de", kind: "asr" }],
    audioTrackId: audioId("dubbed-auto", "es-US"),
    title: "Das ist nicht mein Tag und ich habe keine Lust",
  });
  assert.deepEqual(germanDubbedIntoSpanish, { german: false, reason: "audio" });
});

test("a German title can still decide a video with many automatic captions and no audio information", () => {
  const video = {
    captionTracks: manyAutomatic,
    title: "Das ist nicht mein Tag und ich habe keine Lust",
    description: "Heute sprechen wir über das Wetter und wir haben viel zu erzählen",
  };
  assert.deepEqual(detectGerman(video), { german: true, reason: "text" });
});
