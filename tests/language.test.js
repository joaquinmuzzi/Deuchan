import assert from "node:assert/strict";
import { test } from "node:test";

import { detectGerman, germanScore, isGermanCode } from "../extension/src/language.js";

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
