/**
 * How the background script tells that the browser, or the whole computer, stopped for a while.
 *
 * What runs for a long time (reading counted by hand, the sound of a tab) is looked at every minute by an
 * alarm, which wakes the background script even after it was stopped. So a much longer wait since the last
 * time it was looked at means that nothing ran in between: the browser crashed or was closed, or the
 * computer slept. Nobody can say when exactly it stopped, so the time after the last look is not counted:
 * at most a minute is lost, and never the hours the computer was off.
 */

/**
 * A wait longer than this since the last look, and the browser was not running. Alarms come every minute
 * and can be late by some seconds (a busy computer, a background script that takes a moment to start), so
 * this leaves room for several of them before it decides that nothing ran.
 */
export const MAX_SILENCE_SECONDS = 5 * 60;

/** Whether nothing ran between `lastSeconds` (the last look) and `nowSeconds`. */
export const wasStopped = (lastSeconds, nowSeconds) => nowSeconds - lastSeconds > MAX_SILENCE_SECONDS;
