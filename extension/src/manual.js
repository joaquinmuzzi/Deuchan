/**
 * Reading counted by hand, for what has no video (a comic, a manga): the popup starts it on the tab that
 * is open and stops it. Kept as `manualSession`, `{ startedAt, lastFlushed, title, url, tabId }`, with
 * times in seconds as the log keeps them.
 *
 * Every minute the time since the last minute is counted, so the goal moves while reading. If the
 * computer was not used for a while the person went away: the session ends, and the time it counted in
 * that while is taken back.
 *
 * The session is in the storage, so a background script that is stopped and started again goes on with
 * it. A browser that crashed or was closed, or a computer that slept, leaves it with no minute counted for
 * longer than `MAX_SILENCE_SECONDS` (see alive.js): the reading ended at its last minute, and none of that
 * wait counts. The same when the browser starts again, as the tab it was on is gone.
 */
import { wasStopped } from "./alive.js";
import { cleanUrl, webItemId } from "./items.js";

/** No keyboard or mouse for this long and the reading is over. `chrome.idle` takes seconds. */
export const IDLE_SECONDS = 15 * 60;

/** A session runs at most this long without anyone noticing: a day of reading is not real. */
export const MAX_SESSION_SECONDS = 6 * 3600;

export const MANUAL_ALARM = "deuchan-manual";

/** A new session on a tab. `null` if there is no tab to read on. */
export function startManual(tab, nowSeconds) {
  const url = cleanUrl(tab?.url);
  if (!url || !Number.isInteger(tab?.id)) {
    return null;
  }
  const title = typeof tab.title === "string" ? tab.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  return { startedAt: nowSeconds, lastFlushed: nowSeconds, title, url, tabId: tab.id };
}

/** The session as it was saved, or `null`. */
export function readManual(saved) {
  return saved &&
    Number.isFinite(saved.startedAt) &&
    Number.isFinite(saved.lastFlushed) &&
    cleanUrl(saved.url) &&
    Number.isInteger(saved.tabId)
    ? saved
    : null;
}

/** The item the session counts on, as the background script saves it. */
export const manualItem = (session) => ({
  id: webItemId(session.url),
  title: session.title,
  url: session.url,
  kind: "reading",
});

/**
 * A minute went by, or the session is stopped. What to count, and what is left of the session.
 *
 * @param {object} session
 * @param {number} nowSeconds
 * @param {{ idle?: boolean, stop?: boolean, restart?: boolean }} [what]  `idle`: nobody used the
 *   computer for `IDLE_SECONDS`; `stop`: the person stopped it, or closed its tab; `restart`: the browser
 *   started again, after the session was left open
 * @returns {{ interval: { from, to } | null, takeBack: number, session: object | null }}
 *   `takeBack` is how many seconds already counted were not reading
 */
export function flushManual(session, nowSeconds, { idle = false, stop = false, restart = false } = {}) {
  if (restart || wasStopped(session.lastFlushed, nowSeconds)) {
    // Nothing ran since the last minute: when the reading really stopped is unknown, so it ends there
    return { interval: null, takeBack: 0, session: null };
  }
  const end = Math.min(nowSeconds, session.startedAt + MAX_SESSION_SECONDS);
  if (idle) {
    // Nobody was there since IDLE_SECONDS ago: nothing more, and back what was counted since
    const away = Math.max(session.startedAt, nowSeconds - IDLE_SECONDS);
    return { interval: null, takeBack: Math.max(0, session.lastFlushed - away), session: null };
  }
  const interval = end > session.lastFlushed ? { from: session.lastFlushed, to: end } : null;
  const over = stop || end >= session.startedAt + MAX_SESSION_SECONDS;
  return { interval, takeBack: 0, session: over ? null : { ...session, lastFlushed: end } };
}
