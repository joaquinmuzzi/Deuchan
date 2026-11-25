/**
 * The one-time request for a store rating, shown in the popup.
 *
 * It is asked once, after a moment of success, and either answer ends it for good: "Rate Inputly" opens the
 * store's review page and "Not now" hides it. There is no snoozing, no reward and no nudge towards a number of
 * stars, as the stores' policies ask. The answer is kept in its own key, `ratingPromptDone`; missing means not
 * answered yet, so data saved before this existed needs no migration.
 */

export const RATING_DONE_KEY = "ratingPromptDone";

/**
 * Ten hours: enough use to know whether Inputly works for someone, so a rating says something about it, and a
 * round milestone a regular learner reaches within the first weeks (at the default goal of 30 minutes a day,
 * about three weeks). Asking earlier would interrupt people who are still trying it out; much later, most
 * people who will keep it would never see the request.
 */
export const RATING_THRESHOLD_SECONDS = 10 * 60 * 60;

export const STORE_URLS = {
  chrome: "https://chromewebstore.google.com/detail/imadljjebohcpkeopadcifnodmfbndel/reviews",
  edge: "https://microsoftedge.microsoft.com/addons/detail/ofophfcnojdmdffnfljneagppnnjelpp",
};

/**
 * The store Inputly was most likely installed from, by the browser's user agent, or `null` where there is no
 * listing to rate. Firefox is not on Firefox Add-ons yet, so it gets no request.
 */
export function storeOf(userAgent) {
  const agent = String(userAgent ?? "");
  if (agent.includes("Firefox/")) {
    return null;
  }
  return agent.includes("Edg/") ? "edge" : "chrome";
}

/** The review page to open in this browser, or `null` if the request should not be shown here. */
export function ratingUrl(userAgent) {
  const store = storeOf(userAgent);
  return store ? STORE_URLS[store] : null;
}

/**
 * Whether to show the request: never answered, a store to send people to, and at least ten hours counted in all
 * (the seconds of every day of the log, reading counted by hand included).
 */
export function shouldAskForRating({ totalSeconds, done, userAgent }) {
  return done !== true && ratingUrl(userAgent) !== null && totalSeconds >= RATING_THRESHOLD_SECONDS;
}
