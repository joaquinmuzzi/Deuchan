/**
 * Correcting the time of a day, when the extension counted more than was really watched (a video
 * left playing in a background tab, a video taken for the target language that was not).
 *
 * What was counted is never changed. The correction is kept apart, as `adjust`: the seconds to add
 * (negative to take away) to what this computer counted, and when it was made. The day then shows what
 * the person said, and time counted after the correction is added on top of it.
 *
 * The dashboard shows the day of all the computers (with Mosaik). A correction only changes the time of
 * this one: the others keep theirs, so the most that can be taken away is what this computer counted.
 */
const SECONDS_IN_A_DAY = 24 * 3600;

export const isDayKey = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * A new log in which `day` shows `seconds` in total, with `others` seconds of the other computers on
 * top. The given log is not changed.
 *
 * @param {{ days: object, adjust?: object }} log  this computer
 * @param {string} day  `YYYY-MM-DD`
 * @param {number} seconds  how long the day really was, from 0 to 24 hours, all computers together
 * @param {number} nowMs  the moment of the correction
 * @param {number} [others]  the seconds of the other computers that day, which cannot be corrected here
 */
export function correctDay(log, day, seconds, nowMs, others = 0) {
  if (!isDayKey(day) || !Number.isFinite(seconds) || seconds < 0 || seconds > SECONDS_IN_A_DAY) {
    return log;
  }
  const counted = log.days?.[day] ?? 0;
  const here = Math.max(0, Math.round(seconds) - Math.max(0, Math.round(others ?? 0)));
  const at = Math.max(nowMs, (log.adjust?.[day]?.at ?? 0) + 1);
  return { ...log, adjust: { ...log.adjust, [day]: { seconds: here - counted, at } } };
}

/** The minutes typed for a day: a whole number from 0 to 1440, or `null`. */
export function parseDayMinutes(text) {
  const trimmed = String(text ?? "").trim();
  if (!/^\d{1,4}$/.test(trimmed)) {
    return null;
  }
  const minutes = Number(trimmed);
  return minutes <= SECONDS_IN_A_DAY / 60 ? minutes : null;
}
