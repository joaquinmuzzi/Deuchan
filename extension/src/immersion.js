/**
 * The immersion profile: in a Chrome profile used only for German, every video counts, on any site,
 * without guessing its language. It is kept as `immersion: { enabled }` in the storage of the extension,
 * which every Chrome profile has apart, so it is on in one profile and off in the others by itself.
 *
 * On YouTube the content script counts every video (a video marked "Not German" still does not count).
 * On other sites a script is added to every page while it is on (`generic.js`), which needs two optional
 * permissions, asked for when it is turned on: `scripting` and access to all the sites.
 */

export const IMMERSION_SCRIPT_ID = "deuchan-immersion";

/** What is asked for when it is turned on. */
export const IMMERSION_PERMISSIONS = { permissions: ["scripting"], origins: ["<all_urls>"] };

/** Whether it is on, as it was saved. */
export const immersionOf = (saved) => saved?.enabled === true;

/** The script for every page and frame of every site, for `chrome.scripting.registerContentScripts`. */
export const immersionScript = () => ({
  id: IMMERSION_SCRIPT_ID,
  js: ["src/generic.js"],
  matches: ["<all_urls>"],
  allFrames: true,
  runAt: "document_idle",
  persistAcrossSessions: true,
});
