import { dayKey, daysBefore, formatClock, lastDays, totalOfLastDays, totalSeconds } from "./log.js";

/** The first day with any time, as `YYYY-MM-DD`, or `null` for an empty log. */
export function firstDay(log) {
  return Object.keys(log.days).sort()[0] ?? null;
}

/** The year and month of a `YYYY-MM-DD` key as numbers, with the month from 0 to 11. */
function yearAndMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return { year, month: month - 1 };
}

/** Average seconds per day since the first day with time, today included. */
export function dailyAverage(log, today) {
  const first = firstDay(log);
  if (first === null) {
    return 0;
  }
  const [year, month, day] = first.split("-").map(Number);
  // At noon, so that a daylight saving change cannot add or remove a day
  const start = new Date(year, month - 1, day, 12);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const days = Math.round((end - start) / 86_400_000) + 1;
  return totalSeconds(log) / Math.max(days, 1);
}

/** Average seconds per month since the month of the first day with time, this month included. */
export function monthlyAverage(log, today) {
  const first = firstDay(log);
  if (first === null) {
    return 0;
  }
  const { year, month } = yearAndMonth(first);
  const months = (today.getFullYear() - year) * 12 + (today.getMonth() - month) + 1;
  return totalSeconds(log) / Math.max(months, 1);
}

/** The seconds of each of the last `count` calendar months, the oldest first, ending this month. */
export function lastMonths(log, today, count) {
  const totals = new Map();
  for (const [key, seconds] of Object.entries(log.days)) {
    const month = key.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + seconds);
  }
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (count - 1 - index), 1, 12);
    const month = dayKey(date).slice(0, 7);
    return { month, monthIndex: date.getMonth(), seconds: totals.get(month) ?? 0 };
  });
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

/** Everything the dashboard shows, worked out from the log. */
export function dashboardData(log, today) {
  const week = lastDays(log, today, 7);
  return {
    cards: {
      today: formatClock(week[week.length - 1].seconds),
      week: formatClock(totalOfLastDays(log, today, 7)),
      month: formatClock(totalOfLastDays(log, today, 30)),
      total: formatClock(totalSeconds(log)),
      dailyAverage: formatClock(dailyAverage(log, today)),
      monthlyAverage: formatClock(monthlyAverage(log, today)),
    },
    heatmap: heatmap(log, today, 27),
    week,
    months: lastMonths(log, today, 6),
  };
}
