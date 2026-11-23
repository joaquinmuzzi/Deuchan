/**
 * Takes the time a page counted to the background script, and sends it again if it did not get there.
 *
 * The background script can be stopped at any moment (Chrome stops it after a while, a crash, someone
 * stopping it from the extensions page), and what it holds in memory goes with it. So it answers a
 * `watched` message only once its time is written in the storage. A message that got no answer (it never
 * arrived, or the background script stopped before writing it) is sent again with the next one.
 *
 * Sending the same time twice is harmless: the background script counts each moment once, and keeps the
 * moments it counted for `KEEP_SECONDS` (see coverage.js). A message is only tried again while its time
 * is well within that, so a second copy of time that was written after all always finds it there.
 */

/** A message whose time ended longer ago than this is not tried again (half of `KEEP_SECONDS`). */
export const RESEND_SECONDS = 300;

/** The second at which the last interval of a message ended. */
const endOf = (message) => Math.max(...message.intervals.map((interval) => interval.to));

/**
 * @param {(message: object) => Promise<any>} post  sends a message; resolves once the background script
 *   answered, rejects (or throws) when it did not
 */
export function createSender(post) {
  let failed = [];

  function attempt(message) {
    let sent;
    try {
      sent = Promise.resolve(post(message));
    } catch (error) {
      sent = Promise.reject(error);
    }
    return sent.catch(() => {
      failed.push(message);
    });
  }

  return {
    /** Sends a message with intervals. Resolves when it was answered or kept to be sent again. */
    send: (message) => attempt(message),

    /** Sends again what did not arrive, unless it is too old to be sure it would count once. */
    retry(nowSeconds) {
      const again = failed.filter((message) => endOf(message) >= nowSeconds - RESEND_SECONDS);
      failed = [];
      return Promise.all(again.map(attempt));
    },

    /** How many messages wait to be sent again. */
    get waiting() {
      return failed.length;
    },
  };
}
