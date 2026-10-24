/**
 * Decides whether a YouTube video is in German.
 *
 * YouTube does not say which language is spoken, so this combines two clues, from the most to the
 * least reliable:
 *
 * 1. The automatic captions. YouTube makes them by recognising the speech, in the language it
 *    recognised, so a video with automatic German captions is German and one with automatic
 *    English captions is not. Uploaded captions say nothing: they are often translations.
 * 2. The words of the title and the description, when there are no automatic captions (a new
 *    video, music, or a channel that turned them off).
 *
 * Everything is a pure function of the data of the video, so the guesses can be tested.
 */

/** Words that are German and, as far as possible, nothing else: no "die", "war", "in" or "was", and none shared with French or Spanish such as "des", "es", "du" or "mal". */
const GERMAN_WORDS = new Set(
  (
    "der das und ist nicht ich ein eine einen mit für auf von dem den sich auch wir aber oder noch " +
    "nur bei aus nach wird hat sind über dass wenn schon wie wir ihr euch er zum zur im " +
    "habe haben kann mehr sehr heute jetzt warum wieso diese dieser dieses"
  ).split(" "),
);

/** Fewer words than this are too little to tell. */
const MIN_GERMAN_WORDS = 3;

/** Titles and descriptions mix names and English tags, so the share does not need to be high. */
const MIN_GERMAN_SHARE = 0.12;

export function isGermanCode(languageCode) {
  return /^de($|[-_])/i.test(languageCode ?? "");
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

/**
 * @param {{ captionTracks?: { languageCode: string, kind?: string }[], title?: string, description?: string }} video
 * @returns {{ german: boolean, reason: "automatic-captions" | "text" | "none" }}
 */
export function detectGerman({ captionTracks = [], title = "", description = "" }) {
  const automatic = captionTracks.filter((track) => track.kind === "asr");
  if (automatic.length > 0) {
    return {
      german: automatic.some((track) => isGermanCode(track.languageCode)),
      reason: "automatic-captions",
    };
  }

  const { hits, share } = germanScore(`${title} ${title} ${description}`);
  if (hits >= MIN_GERMAN_WORDS && share >= MIN_GERMAN_SHARE) {
    return { german: true, reason: "text" };
  }
  return { german: false, reason: "none" };
}
