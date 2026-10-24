import { DEFAULT_GOAL_MINUTES, goalSeconds } from "./goal.js";
import { formatClock, lastDays, streak, totalOfLastDays } from "./log.js";

/** What the popup shows, worked out from the log: no DOM here, so it can be tested. */
export function summarize(log, today, goalMinutes = DEFAULT_GOAL_MINUTES) {
  const seconds = lastDays(log, today, 1)[0].seconds;
  return {
    today: formatClock(seconds),
    goal: formatClock(goalSeconds(goalMinutes)),
    goalMet: seconds >= goalSeconds(goalMinutes),
    week: formatClock(totalOfLastDays(log, today, 7)),
    month: formatClock(totalOfLastDays(log, today, 30)),
    streak: streak(log, today),
  };
}
