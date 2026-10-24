import { dayKey, daysBefore, formatClock, lastDays, totalOfLastDays, totalSeconds } from "./log.js";

/** The ranges of the "Time per day" chart, in days. */
export const RANGES = [
  { days: 7, label: "7 days" },
  { days: 15, label: "15 days" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
];
export const DEFAULT_RANGE = 15;

/** A year of one bar per day does not fit, so long ranges put several days in each bar. */
export const groupSize = (days) => (days > 90 ? 4 : 1);

/** The first day with any time, as `YYYY-MM-DD`, or `null` for an empty log. */
export function firstDay(log) {
  return Object.keys(log.days).sort()[0] ?? null;
}

/** A `YYYY-MM-DD` key as a date at noon, so that daylight saving cannot change the day. */
function dateOf(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

/** The number of days from the first day with time to today, both included; 0 for an empty log. */
function daysSinceFirst(log, today) {
  const first = firstDay(log);
  if (first === null) {
    return 0;
  }
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.max(Math.round((end - dateOf(first)) / 86_400_000) + 1, 1);
}

/** Average seconds per day since the first day with time, today included. */
export function dailyAverage(log, today) {
  const days = daysSinceFirst(log, today);
  return days === 0 ? 0 : totalSeconds(log) / days;
}

/** Average seconds per month since the month of the first day with time, this month included. */
export function monthlyAverage(log, today) {
  const first = firstDay(log);
  if (first === null) {
    return 0;
  }
  const [year, month] = first.split("-").map(Number);
  const months = (today.getFullYear() - year) * 12 + (today.getMonth() - (month - 1)) + 1;
  return totalSeconds(log) / Math.max(months, 1);
}

/** How strong a day is drawn, from 0 (nothing) to 5 (the most of the period). */
export function level(seconds, most) {
  if (!(seconds > 0) || !(most > 0)) {
    return 0;
  }
  return Math.min(5, Math.max(1, Math.ceil((5 * seconds) / most)));
}

/**
 * The activity heatmap: `weeks` columns of 7 days, from Sunday to Saturday, the last one ending
 * today. Days after today are `null`, so the last column can be shorter.
 */
export function heatmap(log, today, weeks) {
  const lastSunday = daysBefore(today, today.getDay());
  const cells = [];
  for (let week = weeks - 1; week >= 0; week -= 1) {
    const sunday = daysBefore(lastSunday, week * 7);
    cells.push(
      Array.from({ length: 7 }, (_, weekday) => {
        const date = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + weekday, 12);
        return date > today && dayKey(date) !== dayKey(today)
          ? null
          : { day: dayKey(date), seconds: log.days[dayKey(date)] ?? 0, level: 0 };
      }),
    );
  }
  const most = Math.max(0, ...cells.flat().map((cell) => cell?.seconds ?? 0));
  for (const cell of cells.flat()) {
    if (cell) {
      cell.level = level(cell.seconds, most);
    }
  }
  return cells;
}

/**
 * The bars of "Time per day" for the last `count` days, the oldest first. With `size` days per bar
 * the newest bar is full and the oldest may be shorter. `perDay` is the average of the days in the
 * bar, so bars of any size can be compared with the daily goal.
 */
export function timeline(log, today, count, size = groupSize(count)) {
  const days = lastDays(log, today, count);
  const bars = [];
  for (let end = days.length; end > 0; end -= size) {
    const slice = days.slice(Math.max(0, end - size), end);
    const seconds = slice.reduce((sum, day) => sum + day.seconds, 0);
    bars.unshift({ from: slice[0].day, to: slice.at(-1).day, seconds, perDay: seconds / slice.length });
  }
  return bars;
}

/** Average seconds of each weekday, Monday first, over every day since the first with time. */
export function weekdayAverages(log, today) {
  const totals = Array(7).fill(0);
  const counts = Array(7).fill(0);
  const days = daysSinceFirst(log, today);
  for (let back = 0; back < days; back += 1) {
    const date = daysBefore(today, back);
    const weekday = (date.getDay() + 6) % 7;
    totals[weekday] += log.days[dayKey(date)] ?? 0;
    counts[weekday] += 1;
  }
  return totals.map((total, weekday) => (counts[weekday] === 0 ? 0 : total / counts[weekday]));
}

/** How many of the last `count` days reached `goal` seconds. */
export function daysMeetingGoal(log, today, count, goal) {
  return lastDays(log, today, count).filter(({ seconds }) => seconds >= goal).length;
}

/** The numbers of the dashboard that do not depend on the chosen range. */
export function dashboardData(log, today) {
  return {
    cards: {
      today: formatClock(lastDays(log, today, 1)[0].seconds),
      week: formatClock(totalOfLastDays(log, today, 7)),
      month: formatClock(totalOfLastDays(log, today, 30)),
      total: formatClock(totalSeconds(log)),
      dailyAverage: formatClock(dailyAverage(log, today)),
      monthlyAverage: formatClock(monthlyAverage(log, today)),
    },
    heatmap: heatmap(log, today, 18),
    weekdays: weekdayAverages(log, today),
  };
}
