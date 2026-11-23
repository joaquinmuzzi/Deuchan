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
