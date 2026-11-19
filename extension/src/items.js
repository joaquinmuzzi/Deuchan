/**
 * What time is counted on: an item. A YouTube video is its 11 character id, as it always was. Anything
 * else (a video on another site, a comic read by hand) is `web:<hash>`, from the address of its page.
 */
import { isVideoId } from "./overrides.js";

export const MAX_URL_LENGTH = 2000;

const WEB_ITEM = /^web:[0-9a-z]{1,32}$/;

export const isWebItemId = (value) => typeof value === "string" && WEB_ITEM.test(value);

export const isItemId = (value) => isVideoId(value) || isWebItemId(value);

/** An address that can be kept and opened: http or https, not too long. Anything else is `null`. */
export function cleanUrl(text) {
  if (typeof text !== "string" || text.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** FNV-1a of a text, 32 bits, from a given start: two of them make an id that does not collide. */
function fnv(text, seed) {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * The item of a page: the same page is the same item, whatever its query or its anchor say (they change
 * while a video plays on many sites). `null` if the address is not one.
 */
export function webItemId(text) {
  const url = cleanUrl(text);
  if (!url) {
    return null;
  }
  const { origin, pathname } = new URL(url);
  const key = `${origin}${pathname}`;
  return `web:${fnv(key, 0x811c9dc5)}${fnv(key, 0x2f1b3c4d)}`;
}

export const youtubeUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

/** Where an item can be opened: its address if it was kept, the one of YouTube for a video, or `null`. */
export const itemUrl = (id, url) => cleanUrl(url) ?? (isVideoId(id) ? youtubeUrl(id) : null);

/** The site of an address, as `twitch.tv`, or `null`. */
export function siteOf(text) {
  const url = cleanUrl(text);
  return url ? new URL(url).hostname.replace(/^www\./, "").slice(0, 100) : null;
}
