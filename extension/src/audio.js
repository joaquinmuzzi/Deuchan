/**
 * Sound in the immersion profile: a tab that plays sound counts, whatever plays it (a podcast, a radio,
 * a player that has no video on the page). Chrome says when a tab is audible; the time it is, and is not
 * muted, is counted like a video's, named after the page of the tab (see pages.js). Time that a video of
 * the same tab already counted is counted only once (see coverage.js).
 *
 * Not every sound is something being listened to: a dictionary says a word, a chat makes a noise. A
 * stretch of sound counts once it has lasted `MIN_SOUND_SECONDS`, and then from its start; a shorter one
 * does not. From then on the site has proven itself in that tab and its shorter stretches count too, so
 * that a podcast can be paused every few seconds. Another site in the same tab starts from nothing.
 *
 * YouTube is left to its own script, which knows each video. A page the person said is not in the
 * target language (the popup, while a video plays there) does not count until it changes address.
 *
 * Kept as `sound` in the session storage, as the background script can be stopped while a podcast plays:
 * `{ open: { "<tab id>": { since, site, url, title } }, proven: { "<tab id>": site }, checkedAt }`, with
 * `since` in seconds and the page the tab showed the last time it was looked at. Every minute what is open
 * is counted, so the goal moves while listening. `checkedAt` is the last time the tabs were looked at: a
 * computer that slept with a tab playing must not count the hours it slept (see `resumeSound`).
 */
import { wasStopped } from "./alive.js";

export const AUDIO_ALARM = "deuchan-audio";

/** How long a tab has to be heard without a break for its sound to be something being listened to. */
export const MIN_SOUND_SECONDS = 30;

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

const siteOfTab = (tab) => {
  try {
    return new URL(tab.url).hostname;
  } catch {
    return "";
  }
};

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const entriesOf = (value) =>
  isRecord(value) ? Object.entries(value).filter(([tabId]) => /^\d+$/.test(tabId)) : [];
const without = (record, key) =>
  Object.fromEntries(Object.entries(record).filter(([other]) => other !== key));

/** The sound as it was saved, without anything that is not it. */
export function readSound(saved) {
  return {
    open: Object.fromEntries(
      entriesOf(saved?.open)
        .filter(([, stretch]) => Number.isFinite(stretch?.since) && typeof stretch.site === "string")
        .map(([tabId, { since, site, url, title }]) => [tabId, { since, site, url, title }]),
    ),
    proven: Object.fromEntries(entriesOf(saved?.proven).filter(([, site]) => typeof site === "string")),
    ...(Number.isFinite(saved?.checkedAt) ? { checkedAt: saved.checkedAt } : {}),
  };
}

/**
 * Before the tabs are looked at again: if nothing ran for longer than `MAX_SILENCE_SECONDS` since the last
 * look (the computer slept, see alive.js), what each tab played counts until that look and starts again
 * now, as Chrome may still say that the tab is audible. None of the wait counts.
 * @returns {{ sound: object, parts: { tabId: number, interval: { from: number, to: number } }[] }}
 */
export function resumeSound(sound, nowSeconds) {
  const { checkedAt } = sound;
  if (checkedAt === undefined || !wasStopped(checkedAt, nowSeconds)) {
    return { sound, parts: [] };
  }
  const parts = [];
  const open = {};
  const proven = { ...sound.proven };
  for (const [tabId, stretch] of Object.entries(sound.open)) {
    if (checkedAt > stretch.since && isCounting(sound, tabId, checkedAt)) {
      parts.push({ tabId: Number(tabId), interval: { from: stretch.since, to: checkedAt } });
      proven[tabId] = stretch.site;
    }
    open[tabId] = { ...stretch, since: nowSeconds };
  }
  return { sound: { open, proven, checkedAt }, parts };
}

/** Whether what a tab is playing counts: its site has proven itself there, or has played long enough. */
export function isCounting(sound, tabId, nowSeconds) {
  const stretch = sound.open[tabId];
  return (
    stretch !== undefined &&
    (sound.proven[tabId] === stretch.site || nowSeconds - stretch.since >= MIN_SOUND_SECONDS)
  );
}

/**
 * A tab changed: whether it is `heard` now, and the page it shows. The sound after it, and the interval
 * that ended and counts, if any.
 * @returns {{ sound: object, interval: { from: number, to: number } | null }}
 */
export function setHeard(sound, tab, heard, nowSeconds) {
  const key = String(tab.id);
  const site = siteOfTab(tab);
  const stretch = sound.open[key];
  const page = { site, url: tab.url, title: tab.title };
  if (stretch && heard && stretch.site === site) {
    return { sound: { ...sound, open: { ...sound.open, [key]: { ...stretch, ...page } } }, interval: null };
  }
  const open = without(sound.open, key);
  if (heard) {
    open[key] = { since: nowSeconds, ...page };
  }
  if (!stretch || !(nowSeconds > stretch.since) || !isCounting(sound, key, nowSeconds)) {
    return { sound: { ...sound, open }, interval: null };
  }
  return {
    sound: { ...sound, open, proven: { ...sound.proven, [key]: stretch.site } },
    interval: { from: stretch.since, to: nowSeconds },
  };
}

/** Nothing more is known of a tab: it was closed, or the person said its page is not in the target language. */
export const forgetSound = (sound, tabId) => ({
  ...sound,
  open: without(sound.open, String(tabId)),
  proven: without(sound.proven, String(tabId)),
});

/**
 * A minute went by: what each tab played since its last minute, and the stretches that go on from now.
 * What has not lasted enough yet waits.
 * @returns {{ sound: object, parts: { tabId: number, interval: { from: number, to: number } }[] }}
 */
export function flushSound(sound, nowSeconds) {
  const parts = [];
  const open = {};
  const proven = { ...sound.proven };
  for (const [tabId, stretch] of Object.entries(sound.open)) {
    if (!isCounting(sound, tabId, nowSeconds)) {
      open[tabId] = stretch;
      continue;
    }
    if (nowSeconds > stretch.since) {
      parts.push({ tabId: Number(tabId), interval: { from: stretch.since, to: nowSeconds } });
    }
    open[tabId] = { ...stretch, since: Math.max(stretch.since, nowSeconds) };
    proven[tabId] = stretch.site;
  }
  return { sound: { ...sound, open, proven }, parts };
}
