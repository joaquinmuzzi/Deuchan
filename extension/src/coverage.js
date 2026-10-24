/**
 * Counts each moment of listening once, however many tabs were playing at that moment.
 *
 * Every tab reports the intervals of the clock in which its video played. The background script
 * keeps the intervals already counted (`covered`, sorted and without overlaps) and credits only the
 * part of a new interval that is not in them. Two German videos playing together for a minute are
 * a minute, not two; an hour of one video followed by an hour of another is two hours.
 */

/** Intervals older than this, before the newest one, are forgotten: no tab reports that late. */
export const KEEP_SECONDS = 600;

/** The longest interval that is believed: a tab left playing for hours without a break is a bug. */
const MAX_INTERVAL_SECONDS = 6 * 3600;

/** How far in the future an interval may end: clocks of different tabs are not exactly equal. */
const MAX_FUTURE_SECONDS = 60;

/** Whether `interval` is something a content script could really have measured. */
export function isValidInterval(interval, nowSeconds) {
  const { from, to } = interval ?? {};
  return (
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    to > from &&
    to - from <= MAX_INTERVAL_SECONDS &&
    to <= nowSeconds + MAX_FUTURE_SECONDS
  );
}

/**
 * Adds an interval to the covered ones.
 * @returns {{ covered: {from: number, to: number}[], newSeconds: number }} the new list, and how
 *   many seconds of the interval were not covered before
 */
export function addCoverage(covered, interval) {
  const { from, to } = interval;
  const overlap = covered.reduce(
    (sum, other) => sum + Math.max(0, Math.min(other.to, to) - Math.max(other.from, from)),
    0,
  );

  // Everything that touches the new interval becomes part of it
  const merged = { from, to };
  const rest = [];
  for (const other of covered) {
    if (other.to < from || other.from > to) {
      rest.push(other);
    } else {
      merged.from = Math.min(merged.from, other.from);
      merged.to = Math.max(merged.to, other.to);
    }
  }
  rest.push(merged);
  rest.sort((a, b) => a.from - b.from);

  const newest = Math.max(...rest.map((other) => other.to));
  return {
    covered: rest.filter((other) => other.to >= newest - KEEP_SECONDS),
    newSeconds: to - from - overlap,
  };
}
