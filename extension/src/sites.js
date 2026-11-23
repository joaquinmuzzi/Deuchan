/**
 * The streaming sites Inputly can count without the immersion profile: Netflix, Crunchyroll, Prime Video and
 * Disney+. Each one is off until the person turns it on in the settings, which asks the browser for access
 * to that site alone (see docs/streaming.md). The setting is kept as `streamingSites: { "<site id>": true }`.
 *
 * Nothing here touches the browser: the background script registers the scripts this file describes, and
 * the dashboard asks for the permissions it names.
 */

export const SITES_KEY = "streamingSites";

/**
 * `origins` are what is asked for when the site is turned on. They are all inside the optional `<all_urls>`
 * the manifest declares, so turning a site on adds no warning at install and asks for that site only.
 * `frames` is set where the video plays in a frame of another origin than the page.
 * `experimental` sites were built from other extensions' notes and could not be tried in a real player.
 */
export const STREAMING_SITES = [
  {
    id: "netflix",
    name: "Netflix",
    origins: ["https://www.netflix.com/*"],
  },
  {
    id: "crunchyroll",
    name: "Crunchyroll",
    // The page is on www; its player (Vilos) has been an iframe on static.crunchyroll.com
    origins: ["https://www.crunchyroll.com/*", "https://static.crunchyroll.com/*"],
    frames: ["https://static.crunchyroll.com"],
  },
  {
    id: "primevideo",
    name: "Prime Video",
    // Prime Video has its own site, and plays inside the Amazon store of the countries that have one: the
    // largest ones are asked for; elsewhere Amazon sends the person to primevideo.com
    origins: [
      "https://www.primevideo.com/*",
      "https://www.amazon.com/*",
      "https://www.amazon.co.uk/*",
      "https://www.amazon.de/*",
      "https://www.amazon.co.jp/*",
    ],
    experimental: true,
  },
  {
    id: "disneyplus",
    name: "Disney+",
    origins: ["https://www.disneyplus.com/*"],
    experimental: true,
  },
];

/** The site with this id, or `null`. */
export const siteById = (id) => STREAMING_SITES.find((site) => site.id === id) ?? null;

/** The ids of the sites turned on, as they were saved; anything else is left out. */
export function enabledSites(saved) {
  if (!saved || typeof saved !== "object") {
    return [];
  }
  return STREAMING_SITES.filter((site) => saved[site.id] === true).map((site) => site.id);
}

/** What is asked for when a site is turned on: registering its scripts, and access to its pages only. */
export const sitePermissions = (site) => ({ permissions: ["scripting"], origins: [...site.origins] });

/** The ids of the scripts of a site, so that they can be found and taken away again. */
export const siteScriptIds = (site) => [`inputly-${site.id}-bridge`, `inputly-${site.id}`];

/**
 * The two scripts of a site, for `chrome.scripting.registerContentScripts`: one in the page itself (world
 * "MAIN"), which reads what the player says, and the one that counts (`streaming-content.js`). They start
 * before the page so that the immersion profile's script, which runs later in the same pages, sees that the
 * page is counted already.
 */
export function siteScripts(site) {
  const [bridgeId, contentId] = siteScriptIds(site);
  const common = {
    matches: [...site.origins],
    runAt: "document_start",
    allFrames: Boolean(site.frames),
    persistAcrossSessions: true,
  };
  return [
    { id: bridgeId, js: ["src/streaming-bridge.js"], world: "MAIN", ...common },
    { id: contentId, js: ["src/streaming-content.js"], ...common },
  ];
}

/** Whether a page address belongs to a site: compared with its origins, as the browser matches them. */
export function siteOfUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return (
    STREAMING_SITES.find((site) =>
      site.origins.some((origin) => new URL(origin.replace("/*", "/")).origin === url.origin),
    ) ?? null
  );
}
