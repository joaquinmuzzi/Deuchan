/**
 * Decides whether a YouTube video is in the target language: the one the person learns (see
 * `target.js`), German unless they chose another.
 *
 * YouTube does not say which language is spoken, so this combines three clues, from the most to the
 * least reliable:
 *
 * 0. The audio track that is playing. A video can have several, made by automatic dubbing, and
 *    YouTube plays the one in the language of the viewer: what is heard is what counts, a German
 *    video dubbed into Spanish is not German to the ears, and an English one dubbed into German is.
 * 1. The automatic captions. YouTube makes them by recognising the speech, in the language it
 *    recognised, so a video with automatic German captions is German and one with automatic
 *    English captions is not. Uploaded captions alone say nothing: they are often translations.
 *    Uploaded captions in the target count only when the title or the description also names the
 *    language, as videos for learners say "Comprehensible Japanese" and often have no automatic ones.
 * 2. The text of the title and the description, when there are no automatic captions (a new
 *    video, music, or a channel that turned them off). For German, a list of German function words;
 *    for any other language, the language Chrome detects in the text (`chrome.i18n.detectLanguage`).
 *
 * Everything is a pure function of the data of the video, so the guesses can be tested. Chrome's
 * detector is a browser API and asynchronous, so the content script calls it, only when
 * `needsTextLanguages` says the text will decide, and passes its answer in as `textLanguages`.
 */

import { isTarget, languageName, targetOf } from "./target.js";

/** The language whose text fallback is the word list below instead of Chrome's detector. */
const WORD_LIST_LANGUAGE = "de";

/** Words that are German and, as far as possible, nothing else: no "die", "war", "in" or "was", and none shared with French or Spanish such as "des", "es", "du" or "mal". */
const GERMAN_WORDS = new Set(
  (
    "der das und ist nicht ich ein eine einen mit für auf von dem den sich auch wir aber oder noch " +
    "nur bei aus nach wird hat sind über dass wenn schon wie wir ihr euch er zum zur im " +
    "habe haben kann mehr sehr heute jetzt warum wieso diese dieser dieses"
  ).split(" "),
);

/*
 * German keeps its word list rather than Chrome's detector: the list was tuned on real titles, which
 * mix German with English words, names and tags, where a detector of the whole text tends to answer
 * English; and the person who learns German has months of history counted with it.
 */

/** Fewer words than this are too little to tell. */
const MIN_GERMAN_WORDS = 3;

/** Titles and descriptions mix names and English tags, so the share does not need to be high. */
const MIN_GERMAN_SHARE = 0.12;

/**
 * The language of the audio track that is playing, from its id. The player gives it as
 * `"251;<xtags>"`, where the tags are a base64 text that says, among other things, `lang` (for
 * example `es-US`) and whether the track is the original or dubbed. A video with a single audio track
 * has no language there, and the answer is `null`.
 */
export function audioLanguage(audioTrackId) {
  const tags = typeof audioTrackId === "string" ? audioTrackId.split(";")[1] : undefined;
  if (!tags) {
    return null;
  }
  let text;
  try {
    const base64 = tags.replaceAll("-", "+").replaceAll("_", "/");
    text = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  } catch {
    return null;
  }
  return /lang[^a-zA-Z]{1,3}([a-z]{2,3}(?:-[A-Za-z0-9]{2,4})?)/.exec(text)?.[1] ?? null;
}

/**
 * The share of the words of a text that are German function words, and how many there are.
 * Letters with an umlaut or ß count as extra evidence, as few other languages that write like
 * this use them.
 */
export function germanScore(text) {
  const words = (text ?? "").toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length === 0) {
    return { hits: 0, share: 0 };
  }
  const hits = words.filter((word) => GERMAN_WORDS.has(word)).length;
  const marked = words.filter((word) => /[äöüß]/.test(word)).length;
  return { hits: hits + marked, share: (hits + marked) / words.length };
}

/*
 * Thresholds for Chrome's detector (CLD3), which answers `{ isReliable, languages: [{ language,
 * percentage }] }`, the percentage being the share of the text in that language.
 *
 * - `isReliable` is required: on a few words (a short title and no description) the detector guesses,
 *   and a wrong "yes" would count a whole video without the person noticing, while a wrong "no" shows
 *   in the popup and is one click to correct there.
 * - The target needs 40% of the text, not most of it: descriptions carry links, sponsor lines, credits
 *   and tags in English, so a Japanese or Spanish video often has a fair share of English text. The
 *   title is counted twice (see `videoText`), which already tilts the text toward the spoken language.
 */
export const MIN_TEXT_PERCENT = 40;

/**
 * The text of a video that the language is guessed from: the title twice, as it says more about the
 * video than a description full of links, and the description without its links, which are not words
 * of any language.
 */
export function videoText({ title = "", description = "" } = {}) {
  return `${title} ${title} ${description}`.replace(/\bhttps?:\/\/\S+/gi, " ").trim();
}

/** Whether Chrome's answer about a text says it is in the target language. */
export function textIsTarget(textLanguages, target) {
  if (!textLanguages?.isReliable || !Array.isArray(textLanguages.languages)) {
    return false;
  }
  return textLanguages.languages.some(
    (entry) => isTarget(entry?.language, target) && entry.percentage >= MIN_TEXT_PERCENT,
  );
}

/**
 * Whether the title or the description names the language, in English or in the language itself:
 * "Comprehensible Japanese", "日本語の聞き取り", "Spanish listening", "español para principiantes".
 */
export function namesLanguage({ title = "", description = "" } = {}, target) {
  const text = `${title} ${description}`.toLocaleLowerCase();
  const names = [languageName(target, "en"), languageName(target, target)]
    .filter((name) => name && name !== target)
    .map((name) => name.toLocaleLowerCase());
  return names.some((name) =>
    // Names in scripts without spaces (日本語, 中文) are matched anywhere; Latin ones as whole words, so
    // "English" is not found in "Englishman" nor "Thai" in "Thailand"
    /^[\p{Script=Latin}\s]+$/u.test(name)
      ? new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(text)
      : text.includes(name),
  );
}

/** The clue that decides before the text does, if any: the audio track, automatic captions, or uploaded ones. */
function trackClue({ audioTrackId = null, captionTracks = [], title = "", description = "" }, target) {
  const spoken = audioLanguage(audioTrackId);
  if (spoken) {
    return { inTarget: isTarget(spoken, target), reason: "audio" };
  }
  // One automatic track is the language that was recognised. Several are not: when a video is dubbed
  // YouTube makes captions in every language of the dubbing, and one of them being the target says nothing
  const automatic = (captionTracks ?? []).filter((track) => track?.kind === "asr");
  if (automatic.length === 1) {
    return { inTarget: isTarget(automatic[0].languageCode, target), reason: "automatic-captions" };
  }
  // Uploaded captions are often a translation, so alone they say nothing. But videos for learners
  // (comprehensible input) often have no automatic captions, only uploaded ones in the spoken language
  // and in English, and an English title and description that name the language taught: "Comprehensible
  // Japanese Beginner - My Morning Routine". Uploaded captions in the target and a text that names it
  // count; an English video whose uploaded translation is in the target rarely names the target too.
  if (automatic.length === 0) {
    const uploaded = (captionTracks ?? []).some(
      (track) => track && track.kind !== "asr" && isTarget(track.languageCode, target),
    );
    if (uploaded && namesLanguage({ title, description }, target)) {
      return { inTarget: true, reason: "uploaded-captions" };
    }
  }
  return null;
}

/**
 * Whether the text of the video will decide, and Chrome's detector has to be asked about it: neither
 * the audio nor the captions tell, and the target is not German, which has its word list.
 */
export function needsTextLanguages(video, target) {
  return targetOf(target) !== WORD_LIST_LANGUAGE && trackClue(video ?? {}, targetOf(target)) === null;
}

/**
 * @param {{ audioTrackId?: string | null, captionTracks?: { languageCode: string, kind?: string }[], title?: string, description?: string }} video
 * @param {{ target?: string, textLanguages?: { isReliable: boolean, languages: { language: string, percentage: number }[] } | null }} [options]
 *   `target` is the target language (German if missing); `textLanguages` is what
 *   `chrome.i18n.detectLanguage` said about `videoText(video)`, needed only for a target other than German.
 * @returns {{ inTarget: boolean, reason: "audio" | "automatic-captions" | "uploaded-captions" | "text" | "none" }}
 */
export function detectTarget(video, { target, textLanguages = null } = {}) {
  const language = targetOf(target);
  const clue = trackClue(video ?? {}, language);
  if (clue) {
    return clue;
  }

  if (language === WORD_LIST_LANGUAGE) {
    // The raw text, links included, as German was always scored: its thresholds were tuned on it
    const { title = "", description = "" } = video ?? {};
    const { hits, share } = germanScore(`${title} ${title} ${description}`);
    if (hits >= MIN_GERMAN_WORDS && share >= MIN_GERMAN_SHARE) {
      return { inTarget: true, reason: "text" };
    }
  } else if (textIsTarget(textLanguages, language)) {
    return { inTarget: true, reason: "text" };
  }
  return { inTarget: false, reason: "none" };
}
