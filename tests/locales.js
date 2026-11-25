// The manifest as a store or a browser shows it: `name` and `description` are `__MSG_…__` placeholders, and
// the stores read their text from `_locales/<locale>/messages.json`, one listing per locale. Tests that look
// at the name or the summary read them through here, the way Chrome resolves them.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXTENSION = resolve(dirname(fileURLToPath(import.meta.url)), "..", "extension");

export const readManifest = () => JSON.parse(readFileSync(resolve(EXTENSION, "manifest.json"), "utf8"));

/** The locales the package declares (the folders of `_locales/`). */
export const LOCALES = readdirSync(resolve(EXTENSION, "_locales")).sort();

/** The messages of `locale`, as `{ key: text }`. */
export function messagesOf(locale) {
  const file = JSON.parse(readFileSync(resolve(EXTENSION, "_locales", locale, "messages.json"), "utf8"));
  return Object.fromEntries(Object.entries(file).map(([key, { message }]) => [key, message]));
}

/** `text` with its `__MSG_key__` placeholders replaced by the messages of `locale` (keys ignore case, as in Chrome). */
export function localize(text, locale) {
  const messages = Object.fromEntries(
    Object.entries(messagesOf(locale)).map(([key, message]) => [key.toLowerCase(), message]),
  );
  return text.replace(/__MSG_(\w+)__/g, (placeholder, key) => {
    const message = messages[key.toLowerCase()];
    if (message === undefined) {
      throw new Error(`${placeholder} has no message in ${locale}`);
    }
    return message;
  });
}

/** The name and the summary the store shows for `locale`. */
export function listingOf(locale, manifest = readManifest()) {
  return { name: localize(manifest.name, locale), description: localize(manifest.description, locale) };
}
