import { formatClock, lastDays, streak, totalOfLastDays, totalSeconds } from "./log.js";

/** What the popup shows, worked out from the log: no DOM here, so it can be tested. */
export function summarize(log, today) {
  const week = lastDays(log, today, 7);
  const longest = Math.max(...week.map(({ seconds }) => seconds), 1);
  return {
    today: formatClock(week[week.length - 1].seconds),
    week: formatClock(totalOfLastDays(log, today, 7)),
    month: formatClock(totalOfLastDays(log, today, 30)),
    total: formatClock(totalSeconds(log)),
    streak: streak(log, today),
    bars: week.map(({ day, seconds }) => ({
      day,
      label: formatClock(seconds),
      height: seconds / longest,
    })),
  };
}
