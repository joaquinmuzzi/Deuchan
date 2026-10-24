/** The daily goal: how many minutes of German a day the user wants. Kept as `goalMinutes`. */
export const DEFAULT_GOAL_MINUTES = 30;
export const MIN_GOAL_MINUTES = 1;
export const MAX_GOAL_MINUTES = 600;

/** The goal saved in storage, or the default if there is none or it is not usable. */
export function goalMinutesOf(saved) {
  const usable = Number.isInteger(saved) && saved >= MIN_GOAL_MINUTES && saved <= MAX_GOAL_MINUTES;
  return usable ? saved : DEFAULT_GOAL_MINUTES;
}

/** The minutes a person typed, as a number, or `null` if it is not a whole number in range. */
export function parseGoalMinutes(text) {
  const trimmed = String(text ?? "").trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const minutes = Number(trimmed);
  return minutes >= MIN_GOAL_MINUTES && minutes <= MAX_GOAL_MINUTES ? minutes : null;
}

export const goalSeconds = (minutes) => minutes * 60;
