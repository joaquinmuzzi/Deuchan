/**
 * The target language: the one the person learns, whose input Deuchan counts. It is kept as
 * `targetLanguage` in the storage of the extension, a bare language code ("de", "ja", "yue"), and is
 * missing until the person picks one, which means German: Deuchan counted only German before it had
 * this setting, so whoever had it then notices nothing.
 *
 * Codes come from many places (the setting, YouTube's caption and audio tracks, `chrome.i18n`) and in
 * many shapes ("de-AT", "pt_BR", "iw" for Hebrew), so everything is compared after `normalizeLanguage`.
 */

export const TARGET_KEY = "targetLanguage";
export const DEFAULT_TARGET = "de";

/** The address fragment that opens the dashboard on the setting, as a new install does. */
export const TARGET_HASH = "#language";

/**
 * The languages the picker offers: the ones most learned, plus whatever is saved (see `targetOptions`).
 * Chinese is one entry: a video says "zh-Hans" or "zh-TW", and both are the same language to learn.
 */
export const TARGET_LANGUAGES = Object.freeze([
  "ar",
  "de",
  "el",
  "en",
  "es",
  "fr",
  "he",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh",
]);

const namesIn = new Map();
const displayNames = (locale) => {
  if (!namesIn.has(locale)) {
    // fallback "none": an unknown code has no name, instead of its own code as the name
    namesIn.set(locale, new Intl.DisplayNames([locale], { type: "language", fallback: "none" }));
  }
  return namesIn.get(locale);
};

/**
 * The language of a BCP 47 tag as a bare code, or `null` if it is not a known language: "de-AT" and
 * "DE" give "de", "zh-Hant-TW" gives "zh", and the old "iw", "in" and "ji" give "he", "id" and "yi".
 */
export function normalizeLanguage(tag) {
  if (typeof tag !== "string") {
    return null;
  }
  try {
    // Canonical form fixes the case and replaces the deprecated codes YouTube still uses for some languages
    const { language } = new Intl.Locale(Intl.getCanonicalLocales(tag.trim().replace(/_/g, "-"))[0]);
    // "und" (undetermined) and codes nobody uses, like "xx", have no name; Intl.DisplayNames throws
    // for some well-formed tags it does not take as a language code, like "german"
    return language !== "und" && displayNames("en").of(language) ? language : null;
  } catch {
    return null;
  }
}

/** The target saved in storage, or German if there is none or it is not usable. */
export const targetOf = (saved) => normalizeLanguage(saved) ?? DEFAULT_TARGET;

/** Whether a language tag, as a video or a track gives it ("de-DE"), is the target ("de"). */
export const isTarget = (tag, target) => {
  const language = normalizeLanguage(tag);
  return language !== null && language === targetOf(target);
};

/** The name of a language, in English unless another locale is given: "de" gives "German". */
export function languageName(code, locale = "en") {
  const language = normalizeLanguage(code);
  return (language && displayNames(locale).of(language)) ?? String(code);
}

/** The name of the saved target, as the pages say it: "German" while nothing is saved, "Japanese" for `"ja"`. */
export const targetName = (saved, locale = "en") => languageName(targetOf(saved), locale);

/**
 * What the picker shows, as `{ code, name }` sorted by name: the offered languages, plus the saved one
 * if it is not among them, so that a language set some other way is not lost by opening the settings.
 */
export function targetOptions(saved, locale = "en") {
  const current = targetOf(saved);
  const codes = TARGET_LANGUAGES.includes(current) ? TARGET_LANGUAGES : [...TARGET_LANGUAGES, current];
  return codes
    .map((code) => ({ code, name: languageName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
