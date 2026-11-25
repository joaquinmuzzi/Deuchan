// The manifest of the Firefox build, made from the one of Chrome (`extension/manifest.json`), so that both
// builds share every other file. Only the manifest differs: the code runs as it is in both browsers (see
// docs/firefox.md for what was checked).

/**
 * The add-on id in Firefox. Firefox Add-ons (AMO) knows the extension by it, and every update must keep it:
 * never change it once a version is published there.
 */
export const GECKO_ID = "inputly@joaquinmuzzi.github.io";

/**
 * The oldest Firefox it installs in. 140 is the first with the built-in data consent of
 * `data_collection_permissions` (which AMO asks of every new extension since November 2025), and the
 * current ESR. It is also past what the code needs: `world: "MAIN"` content scripts and
 * `optional_host_permissions` (128), `storage.session` (115) and module background scripts (112).
 */
export const FIREFOX_MIN_VERSION = "140.0";

/**
 * The name in Firefox. Firefox refuses a `name` longer than 45 characters (web-ext lint: "/name must NOT have
 * more than 45 characters"), while the Chrome name carries the words people search the Chrome Web Store for
 * and is longer. AMO search reads the listing too, so the short name loses little.
 *
 * The Chrome name is a message of `_locales/` (`__MSG_extName__`), so that each store language gets its own
 * name: the Firefox build points at a second message, `extNameFirefox`, kept short in every locale (a test
 * checks each one), so Firefox shows a translated name too. That test is the only guard: web-ext lint measures
 * the placeholder, not its messages, and passes a 74-character message.
 */
export const FIREFOX_NAME = "__MSG_extNameFirefox__";
export const FIREFOX_NAME_MAX = 45;

/** Keys only Chrome reads: Firefox warns about them, so they are left out. */
const CHROME_ONLY = ["minimum_chrome_version"];

/**
 * The Firefox manifest for a Chrome `manifest`, which is not changed. Firefox has no background service
 * worker: the same module runs as a background script (an event page, which Firefox stops when idle as
 * Chrome stops the worker, so the code already copes with it).
 */
export function firefoxManifest(manifest) {
  const result = structuredClone(manifest);
  for (const key of CHROME_ONLY) {
    delete result[key];
  }
  const { service_worker: worker, ...background } = result.background ?? {};
  if (!worker) {
    throw new Error("The Chrome manifest has no background service worker");
  }
  result.background = { ...background, scripts: [worker] };
  if (result.name === "__MSG_extName__") {
    result.name = FIREFOX_NAME;
  } else if (result.name.length > FIREFOX_NAME_MAX) {
    // A placeholder's length says nothing about its message, so only a literal name is measured here
    throw new Error(
      `The name "${result.name}" is longer than the ${FIREFOX_NAME_MAX} characters Firefox allows`,
    );
  }
  result.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      // Nothing goes to the developer or to anyone else. "Send to Mosaik" sends to a server the person runs
      // and types in themselves; see the Firefox section of PRIVACY.md and docs/firefox.md.
      data_collection_permissions: { required: ["none"] },
    },
  };
  return result;
}
