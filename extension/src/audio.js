/**
 * Sound in the immersion profile: a tab that plays sound counts, whatever plays it (a podcast, a radio,
 * a player that has no video on the page). Chrome says when a tab is audible; the time it is, and is not
 * muted, is counted like a video's, named after the page of the tab (see pages.js). Time that a video of
 * the same tab already counted is counted only once (see coverage.js).
 *
 * YouTube is left to its own script, which knows each video. A page the person said is not German
 * (the popup, while a video plays there) does not count until it changes address.
 *
 * Kept as `audible`, `{ "<tab id>": since }` in seconds, in the session storage: the background script
 * can be stopped while a podcast plays, and the stretch since `since` is still counted when it wakes up.
 * Every minute what is open is counted, so the goal moves while listening.
 */

export const AUDIO_ALARM = "deuchan-audio";

/** Whether the tab's sound counts: it is heard, and it is not YouTube, which counts by itself. */
export function hears(tab) {
  if (tab?.audible !== true || tab.mutedInfo?.muted === true) {
    return false;
  }
  try {
    return new URL(tab.url).hostname !== "www.youtube.com";
  } catch {
    // An address it cannot see is still a page with sound
    return true;
  }
}

/** The stretches as they were saved, without anything that is not one. */
export function readAudible(saved) {
  if (!saved || typeof saved !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(saved).filter(([tabId, since]) => /^\d+$/.test(tabId) && Number.isFinite(since)),
  );
}

/**
 * A tab started or stopped being heard. The stretches after it, and the interval it closed, if any.
 * @returns {{ audible: object, interval: { from: number, to: number } | null }}
 */
export function setHeard(audible, tabId, heard, nowSeconds) {
  const key = String(tabId);
  const since = audible[key];
  if (heard && since === undefined) {
    return { audible: { ...audible, [key]: nowSeconds }, interval: null };
  }
  if (!heard && since !== undefined) {
    const rest = Object.fromEntries(Object.entries(audible).filter(([other]) => other !== key));
    return { audible: rest, interval: nowSeconds > since ? { from: since, to: nowSeconds } : null };
  }
  return { audible, interval: null };
}

/**
 * A minute went by: what each tab played since its last minute, and the stretches that go on from now.
 * @returns {{ audible: object, parts: { tabId: number, interval: { from: number, to: number } }[] }}
 */
export function flushAudible(audible, nowSeconds) {
  const parts = [];
  const next = {};
  for (const [tabId, since] of Object.entries(audible)) {
    if (nowSeconds > since) {
      parts.push({ tabId: Number(tabId), interval: { from: since, to: nowSeconds } });
    }
    next[tabId] = Math.max(since, nowSeconds);
  }
  return { audible: next, parts };
}
