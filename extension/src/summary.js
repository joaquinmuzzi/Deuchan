import { DEFAULT_GOAL_MINUTES, goalSeconds } from "./goal.js";
import { formatClock, lastDays, streak, totalOfLastDays } from "./log.js";
import { dailyAverage } from "./stats.js";

/** What the popup shows, worked out from the log: no DOM here, so it can be tested. */
export function summarize(log, today, goalMinutes = DEFAULT_GOAL_MINUTES) {
  const seconds = lastDays(log, today, 1)[0].seconds;
  const goal = goalSeconds(goalMinutes);
  const goalMet = seconds >= goal;
  const days = streak(log, today);
  return {
    today: formatClock(seconds),
    goal: formatClock(goal),
    goalMet,
    // What is left, which is what matters while the goal is not reached; the bar stops at the goal
    goalText: goalMet
      ? `Goal reached · ${formatClock(goal)}`
      : `${formatClock(goal - seconds)} left of ${formatClock(goal)}`,
    progress: Math.min(seconds / goal, 1),
    streak: `${days} ${days === 1 ? "day" : "days"}`,
    dailyAverage: formatClock(dailyAverage(log, today)),
    week: formatClock(totalOfLastDays(log, today, 7)),
  };
}
