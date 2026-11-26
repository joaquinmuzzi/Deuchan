import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_TEXT_PERCENT,
  audioLanguage,
  detectTarget,
  germanScore,
  namesLanguage,
  needsTextLanguages,
  otherTrackInTarget,
  textIsTarget,
  videoText,
} from "../extension/src/language.js";

test("German automatic captions in any variant mean German, and other languages do not", () => {
  // "deu" is the three-letter code of German, so it is German too
  for (const languageCode of ["de", "de-DE", "de-AT", "DE", "de_CH", "deu"]) {
    const video = { captionTracks: [{ languageCode, kind: "asr" }] };
    assert.equal(detectTarget(video).inTarget, true, languageCode);
  }
  for (const languageCode of ["en", "es", "dk", "", undefined]) {
    const video = { captionTracks: [{ languageCode, kind: "asr" }] };
    assert.equal(detectTarget(video).inTarget, false, String(languageCode));
  }
});

test("automatic German captions mean German", () => {
  const video = { captionTracks: [{ languageCode: "de", kind: "asr" }] };
  assert.deepEqual(detectTarget(video), { inTarget: true, reason: "automatic-captions" });
});

test("automatic captions in another language mean not German, whatever the title says", () => {
  const video = {
    captionTracks: [{ languageCode: "en", kind: "asr" }],
    title: "Das ist nicht mein Tag und ich habe keine Lust",
  };
  assert.deepEqual(detectTarget(video), { inTarget: false, reason: "automatic-captions" });
});

test("uploaded German captions alone do not decide: they may be a translation", () => {
  const video = { captionTracks: [{ languageCode: "de" }], title: "How to bake bread at home" };
  assert.equal(detectTarget(video).inTarget, false);
});

test("a German title and description are German when there are no automatic captions", () => {
  const video = {
    title: "Ich lerne Deutsch mit Musik",
    description: "In diesem Video sprechen wir über das Wetter und wie es heute in Berlin ist.",
  };
  assert.deepEqual(detectTarget(video), { inTarget: true, reason: "text" });
});

test("English, Spanish and French texts are not German", () => {
  const texts = [
    "How to learn a language fast: the only guide you need and why it works",
    "Cómo aprender idiomas rápido, la guía que necesitas para empezar hoy",
    "Comment apprendre une langue avec des séries et des chansons",
  ];
  for (const title of texts) {
    assert.equal(detectTarget({ title, description: title }).inTarget, false, title);
  }
});

test("an empty video is not German", () => {
  assert.deepEqual(detectTarget({}), { inTarget: false, reason: "none" });
});

test("one German word in an English title is not enough", () => {
  assert.equal(
    detectTarget({ title: "Why I moved to Berlin and what I did not expect, mit Humor" }).inTarget,
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
    assert.deepEqual(detectTarget({ ...english, captionTracks: manyAutomatic, audioTrackId }), {
      inTarget: false,
      reason: "audio",
    });
  }
  // and without knowing the audio, so many automatic captions say nothing about the language
  assert.equal(detectTarget({ ...english, captionTracks: manyAutomatic }).inTarget, false);
});

test("the audio that is heard decides: an English video dubbed into German is German, a German one dubbed into Spanish is not", () => {
  const dubbedIntoGerman = detectTarget({
    captionTracks: manyAutomatic,
    audioTrackId: audioId("dubbed-auto", "de-DE"),
    title: "An English title",
  });
  assert.deepEqual(dubbedIntoGerman, { inTarget: true, reason: "audio" });
  const germanDubbedIntoSpanish = detectTarget({
    captionTracks: [{ languageCode: "de", kind: "asr" }],
    audioTrackId: audioId("dubbed-auto", "es-US"),
    title: "Das ist nicht mein Tag und ich habe keine Lust",
  });
  assert.deepEqual(germanDubbedIntoSpanish, { inTarget: false, reason: "audio" });
});

test("a German title can still decide a video with many automatic captions and no audio information", () => {
  const video = {
    captionTracks: manyAutomatic,
    title: "Das ist nicht mein Tag und ich habe keine Lust",
    description: "Heute sprechen wir über das Wetter und wir haben viel zu erzählen",
  };
  assert.deepEqual(detectTarget(video), { inTarget: true, reason: "text" });
});

// Other target languages: the tracks are compared with the target, and the text goes to Chrome's detector

/** What `chrome.i18n.detectLanguage` answers, for tests: reliable unless said otherwise. */
const detected = (languages, isReliable = true) => ({
  isReliable,
  languages: Object.entries(languages).map(([language, percentage]) => ({ language, percentage })),
});

test("the audio track decides for any target: Japanese and Spanish", () => {
  const ja = {
    audioTrackId: audioId("original", "ja"),
    captionTracks: manyAutomatic,
    title: "An English title",
  };
  assert.deepEqual(detectTarget(ja, { target: "ja" }), { inTarget: true, reason: "audio" });
  assert.deepEqual(detectTarget(ja, { target: "es" }), { inTarget: false, reason: "audio" });
  assert.deepEqual(detectTarget(ja), { inTarget: false, reason: "audio" });
  // the Spanish automatic dubbing of an English video is Spanish to the ears, in any variant
  const dubbed = { audioTrackId: audioId("dubbed-auto", "es-US"), captionTracks: manyAutomatic };
  assert.deepEqual(detectTarget(dubbed, { target: "es" }), { inTarget: true, reason: "audio" });
  assert.deepEqual(detectTarget(dubbed, { target: "ja" }), { inTarget: false, reason: "audio" });
});

test("a single automatic caption track decides for any target, whatever the detector says", () => {
  const japanese = {
    captionTracks: [{ languageCode: "ja", kind: "asr" }, { languageCode: "en" }],
    title: "【初心者向け】日本語の聞き取り練習 | Japanese listening practice",
  };
  const notJapanese = detected({ en: 90 });
  assert.deepEqual(detectTarget(japanese, { target: "ja", textLanguages: notJapanese }), {
    inTarget: true,
    reason: "automatic-captions",
  });
  const spanish = {
    captionTracks: [{ languageCode: "es-419", kind: "asr" }],
    title: "How I learned Spanish",
  };
  assert.deepEqual(detectTarget(spanish, { target: "es" }), { inTarget: true, reason: "automatic-captions" });
  assert.deepEqual(detectTarget(spanish, { target: "ja" }), {
    inTarget: false,
    reason: "automatic-captions",
  });
  // and the German word list does not apply when the target is another language
  const german = { captionTracks: [{ languageCode: "en", kind: "asr" }], title: "Das ist nicht mein Tag" };
  assert.equal(detectTarget(german, { target: "es", textLanguages: detected({ es: 100 }) }).inTarget, false);
});

test("without tracks, a Japanese or Spanish title and description are in the target when the detector is sure", () => {
  const japanese = {
    title: "日本の田舎で暮らす一日 | 字幕なし",
    description: "今日は田舎の家で一日を過ごしました。チャンネル登録お願いします！ https://example.com/merch",
  };
  assert.deepEqual(detectTarget(japanese, { target: "ja", textLanguages: detected({ ja: 85, en: 15 }) }), {
    inTarget: true,
    reason: "text",
  });
  const spanish = {
    title: "Cómo es vivir en Buenos Aires siendo extranjero",
    description: "En este video les cuento cómo fue mudarme. Follow me on Instagram!",
  };
  assert.deepEqual(detectTarget(spanish, { target: "es", textLanguages: detected({ es: 70, en: 30 }) }), {
    inTarget: true,
    reason: "text",
  });
  // the same answer about another language is not the target
  assert.deepEqual(detectTarget(spanish, { target: "ja", textLanguages: detected({ es: 70, en: 30 }) }), {
    inTarget: false,
    reason: "none",
  });
});

test("an unreliable answer, too small a share or no answer at all is not the target", () => {
  const video = { title: "Hola", description: "" };
  for (const textLanguages of [
    detected({ es: 100 }, false),
    detected({ en: 100 - (MIN_TEXT_PERCENT - 1), es: MIN_TEXT_PERCENT - 1 }),
    detected({}),
    null,
    undefined,
    { isReliable: true },
  ]) {
    assert.deepEqual(detectTarget(video, { target: "es", textLanguages }), {
      inTarget: false,
      reason: "none",
    });
  }
  assert.equal(textIsTarget(detected({ en: 60, es: MIN_TEXT_PERCENT }), "es"), true);
  // the detector's codes come in any shape: "zh-Hant" is Chinese, "iw" is Hebrew
  assert.equal(textIsTarget(detected({ "zh-Hant": 90 }), "zh"), true);
  assert.equal(textIsTarget(detected({ iw: 90 }), "he"), true);
});

test("German keeps its word list: the detector is neither needed nor used", () => {
  const video = {
    title: "Ich lerne Deutsch mit Musik",
    description: "In diesem Video sprechen wir über das Wetter und wie es heute in Berlin ist.",
  };
  assert.equal(needsTextLanguages(video, "de"), false);
  assert.equal(needsTextLanguages(video, undefined), false);
  assert.deepEqual(detectTarget(video, { target: "de", textLanguages: detected({ en: 100 }) }), {
    inTarget: true,
    reason: "text",
  });
  assert.deepEqual(detectTarget({ title: "Hello" }, { target: "de", textLanguages: detected({ de: 100 }) }), {
    inTarget: false,
    reason: "none",
  });
});

test("the detector is asked only when the text decides", () => {
  const text = { title: "日本語の練習" };
  assert.equal(needsTextLanguages(text, "ja"), true);
  assert.equal(needsTextLanguages({ ...text, captionTracks: manyAutomatic }, "ja"), true);
  assert.equal(
    needsTextLanguages({ ...text, captionTracks: [{ languageCode: "ja", kind: "asr" }] }, "ja"),
    false,
  );
  assert.equal(needsTextLanguages({ ...text, audioTrackId: audioId("original", "en-US") }, "es"), false);
});

test("videoText weighs the title twice and leaves the links out", () => {
  assert.equal(
    videoText({ title: "Título", description: "Mirá https://example.com/a?b=c y http://x.y" }),
    "Título Título Mirá   y",
  );
  assert.equal(videoText({}), "");
});

// Real videos for learners of Japanese (2026-11-25): no audio language, no automatic captions, uploaded
// captions in Japanese (and English), and an English title and description that name Japanese
test("uploaded captions in the target count when the title names the language", () => {
  const morningRoutine = {
    captionTracks: [{ languageCode: "en" }, { languageCode: "ja" }],
    title: "Comprehensible Japanese Beginner - My Morning Routine",
    description:
      "Hello guys! This is a Comprehensible Japanese video! In this video, I talked about my morning routine!",
  };
  assert.deepEqual(detectTarget(morningRoutine, { target: "ja" }), {
    inTarget: true,
    reason: "uploaded-captions",
  });
  const listening = {
    captionTracks: [{ languageCode: "en" }, { languageCode: "ja" }],
    title: "1 Hour N5 Beginner Japanese Listening Practice / Immersion Learning! #168",
  };
  assert.equal(detectTarget(listening, { target: "ja" }).inTarget, true);
  const unpacking = {
    captionTracks: [{ languageCode: "ja" }],
    title: "Let's Play Unpacking EP01 | Complete Beginner Japanese Comprehensible Input",
  };
  assert.equal(detectTarget(unpacking, { target: "ja" }).inTarget, true);
  // The text no longer has to be asked about: the captions decided
  assert.equal(needsTextLanguages(morningRoutine, "ja"), false);
});

test("the language can be named in the language itself", () => {
  const video = {
    captionTracks: [{ languageCode: "ja" }],
    title: "日本語の聞き取り練習 | Listening practice",
  };
  assert.equal(detectTarget(video, { target: "ja" }).inTarget, true);
  const spanish = {
    captionTracks: [{ languageCode: "es" }],
    title: "Cuento corto en español para principiantes",
  };
  assert.equal(detectTarget(spanish, { target: "es" }).inTarget, true);
});

test("uploaded captions in the target do not count when the text does not name the language", () => {
  // An English video with an uploaded Japanese translation
  const video = {
    captionTracks: [{ languageCode: "en" }, { languageCode: "ja" }],
    title: "How I edit my videos in one hour",
  };
  assert.equal(needsTextLanguages(video, "ja"), true);
  assert.deepEqual(detectTarget(video, { target: "ja" }), { inTarget: false, reason: "none" });
});

test("naming the language without uploaded captions in it does not count", () => {
  const video = { captionTracks: [{ languageCode: "en" }], title: "Japanese grammar explained in English" };
  assert.equal(detectTarget(video, { target: "ja" }).inTarget, false);
});

test("automatic captions still decide over uploaded ones and the title", () => {
  const video = {
    captionTracks: [{ languageCode: "ja" }, { languageCode: "en", kind: "asr" }],
    title: "Learn Japanese: 10 phrases for travel",
  };
  assert.deepEqual(detectTarget(video, { target: "ja" }), { inTarget: false, reason: "automatic-captions" });
});

test("namesLanguage matches whole words in Latin scripts and anywhere in others", () => {
  assert.equal(namesLanguage({ title: "Easy JAPANESE stories" }, "ja"), true);
  assert.equal(namesLanguage({ title: "日本語で話そう" }, "ja"), true);
  assert.equal(namesLanguage({ title: "Thailand travel vlog" }, "th"), false);
  assert.equal(namesLanguage({ title: "An Englishman in New York" }, "en"), false);
  assert.equal(namesLanguage({ description: "Deutsch lernen mit Geschichten" }, "de"), true);
  assert.equal(namesLanguage({}, "ja"), false);
});

test("an automatic dub over a video in the target is told apart, so the popup can say which track to pick", () => {
  const japanese = audioId("original", "ja");
  const englishDub = audioId("dubbed-auto", "en-US");
  const tracks = [englishDub, japanese];
  assert.equal(otherTrackInTarget({ audioTrackId: englishDub, audioTrackIds: tracks }, "ja"), true);
  // The Japanese track plays: it counts, and there is nothing to say
  assert.equal(otherTrackInTarget({ audioTrackId: japanese, audioTrackIds: tracks }, "ja"), false);
  // No track in the target, or a video with one audio track (no language in its id)
  assert.equal(otherTrackInTarget({ audioTrackId: englishDub, audioTrackIds: tracks }, "de"), false);
  assert.equal(otherTrackInTarget({ audioTrackId: "251;", audioTrackIds: ["251;"] }, "ja"), false);
  assert.equal(otherTrackInTarget({ audioTrackId: englishDub }, "ja"), false);
  assert.equal(otherTrackInTarget({ audioTrackId: englishDub, audioTrackIds: "x" }, "ja"), false);
  // A Spanish dub of an English video, for someone who learns Spanish and hears the original
  const english = audioId("original", "en-US");
  assert.equal(
    otherTrackInTarget(
      { audioTrackId: english, audioTrackIds: [english, audioId("dubbed-auto", "es-US")] },
      "es",
    ),
    true,
  );
});
