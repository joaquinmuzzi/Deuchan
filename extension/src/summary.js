import { formatDuration, lastDays, streak, totalOfLastDays, totalSeconds } from "./log.js";

/** What the popup shows, worked out from the log: no DOM here, so it can be tested. */
export function summarize(log, today) {
  const week = lastDays(log, today, 7);
  const longest = Math.max(...week.map(({ seconds }) => seconds), 1);
  return {
    today: formatDuration(week[week.length - 1].seconds),
    week: formatDuration(totalOfLastDays(log, today, 7)),
    month: formatDuration(totalOfLastDays(log, today, 30)),
    total: formatDuration(totalSeconds(log)),
    streak: streak(log, today),
    bars: week.map(({ day, seconds }) => ({
      day,
      label: formatDuration(seconds),
      height: seconds / longest,
    })),
  };
}
