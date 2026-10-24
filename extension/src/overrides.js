/**
 * What the user decided about a video, when the guess about its language is wrong: `true` for "this
 * is German" and `false` for "this is not". Kept as `overrides`, an object from the id of the video
 * to the decision. The decision of the user wins over the guess, and is remembered for the next time
 * the video is opened.
 */

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
