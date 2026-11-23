/**
 * What the user decided about a video, when the guess about its language is wrong: `true` for "this
 * is in the target language" and `false` for "this is not". Kept as an object from the id of the video
 * to the decision. The decision of the user wins over the guess, and is remembered for the next time
 * the video is opened.
 *
 * Each target language has its own set of decisions, under its own key (see `overridesKey`): "this is
 * not Japanese" says nothing about German. German keeps the key it always had, `overrides`, so the
 * decisions made before there was a choice of language keep working, and the stored shape is the same
 * for every language.
 */

import { targetOf } from "./target.js";

/** The storage key of the decisions about one target language: `overrides` for German, `overrides:ja` for Japanese. */
export function overridesKey(target) {
  const language = targetOf(target);
  // German by name, not as the default target: its key stays the one the old decisions are under
  return language === "de" ? "overrides" : `overrides:${language}`;
}

/** The number of decisions kept: the oldest are forgotten, so the storage does not grow forever. */
export const MAX_OVERRIDES = 500;

/** A YouTube video id: 11 characters, letters, digits, `-` and `_`. Nothing else becomes a key. */
export const isVideoId = (value) => typeof value === "string" && /^[\w-]{11}$/.test(value);

/** The language verdict for a video: the decision of the user if there is one, else the guess. */
export function verdict(overrides, videoId, detected) {
  const decided = overrides?.[videoId];
  return typeof decided === "boolean" ? decided : detected;
}

/** A new set of decisions with one more (or changed); the given one is not changed. */
export function withOverride(overrides, videoId, german, limit = MAX_OVERRIDES) {
  const rest = Object.fromEntries(Object.entries(overrides ?? {}).filter(([id]) => id !== videoId));
  // The newest decision goes last, and what goes over the limit is the oldest
  const entries = [...Object.entries(rest), [videoId, german]];
  return Object.fromEntries(entries.slice(-limit));
}
