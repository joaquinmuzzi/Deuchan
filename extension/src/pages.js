/**
 * The pages each tab showed, so that the time of a video on another site goes to the page it was
 * watched on, with that page's title.
 *
 * Sites that change page without loading one (Twitch, from one channel to another) change the address
 * first and the title a moment later. Naming the time after the tab as it is when it arrives would give
 * the new address the old page's title, and the seconds just before the change to the new page. Here
 * every interval is split where the address changed, and a page's title is only trusted once the title
 * changed after the address, or once the address stayed long enough for a page whose title is the same.
 *
 * Kept in memory only, `{ "<tab id>": [{ url, since, title, titled }] }`, oldest first; `since` is in
 * seconds. A page it never saw (the background script just woke up) is named after the tab as it is.
 */

/** Seconds after which a page that kept the title it had is taken to have that title. */
export const SETTLE_SECONDS = 3;

/** The pages kept per tab: an interval is never older than a few of them. */
export const MAX_PAGES_PER_TAB = 10;

/**
 * The title of a page without the count of unread notifications that many sites (Twitch, Facebook) put
 * in front of it: "(2) Twitch" is "Twitch".
 */
export const pageTitle = (title) => (typeof title === "string" ? title.replace(/^\(\d+\+?\)\s+/, "") : title);

/** The pages with a tab's change: a new address, a new title, or both. The given ones are not changed. */
export function trackPage(pages, tabId, { url, title }, at) {
  const list = pages[tabId] ?? [];
  const last = list.at(-1);
  let next = list;
  if (typeof url === "string" && url !== last?.url) {
    // Until the title changes, the tab still shows the one of the page before
    next = [
      ...list,
      { url, since: at, title: typeof title === "string" ? title : (last?.title ?? ""), titled: false },
    ];
  } else if (last && typeof title === "string" && title !== last.title) {
    next = [...list.slice(0, -1), { ...last, title, titled: true }];
  }
  if (next === list) {
    return pages;
  }
  return { ...pages, [tabId]: next.slice(-MAX_PAGES_PER_TAB) };
}

/** The pages of a tab that is closed are forgotten. */
export function forgetTab(pages, tabId) {
  return Object.fromEntries(Object.entries(pages).filter(([key]) => key !== String(tabId)));
}

/** The title of a page shown until `until`, or "" while it may still be the one of the page before. */
function titleOf(page, until) {
  return page.titled || until - page.since >= SETTLE_SECONDS ? page.title : "";
}

/**
 * The intervals of a tab, split by the page each part was watched on: `[{ url, title, intervals }]`.
 * `tab` is the tab as it is now, for a tab whose pages were not seen. `now` is in seconds.
 */
export function splitByPage(pages, tabId, intervals, tab, now) {
  const list = pages[tabId] ?? [];
  if (list.length === 0) {
    return [{ url: tab?.url, title: tab?.title, intervals }];
  }
  const groups = new Map();
  const add = (page, title, interval) => {
    const key = `${page.url}\n${title}`;
    const group = groups.get(key) ?? { url: page.url, title, intervals: [] };
    group.intervals.push(interval);
    groups.set(key, group);
  };
  for (const interval of intervals) {
    list.forEach((page, index) => {
      const until = list[index + 1]?.since ?? Infinity;
      // The first page known also takes what was before it: the tab showed it, or nothing better is known
      const start = index === 0 ? interval.from : Math.max(interval.from, page.since);
      const end = Math.min(interval.to, until);
      if (end > start) {
        add(page, titleOf(page, Math.min(until, now)), { ...interval, from: start, to: end });
      }
    });
  }
  return [...groups.values()];
}
