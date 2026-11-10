/**
 * Correcting the time of a day, when the extension counted more than was really watched (a video
 * left playing in a background tab, a video taken for German that was not).
 *
 * A day cannot be lowered by writing a smaller number, because every copy of the days only grows
 * (see `sync-data.js`). Instead this device keeps a correction for the day, `adjust`: the seconds
 * to add (negative to take away) to what all the devices counted, and when it was made. The day then
 * shows exactly what the person said, now and on their other computers, and time that is counted
 * after the correction is added on top of it. Of all the corrections of a day, from any computer,
 * only the newest counts, so correcting it on two computers is not counted twice.
 */
import { effectiveLog, sanitizeDevices } from "./sync-data.js";

const SECONDS_IN_A_DAY = 24 * 3600;

export const isDayKey = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** What a day shows, with all the devices and all the corrections. */
export const dayTotal = (log, others, day) => effectiveLog(log, others).days[day] ?? 0;

/**
 * A new log in which `day` has `seconds` in total. The given log is not changed. Only the correction
 * of this device changes, so it works whichever computer counted the extra time.
 *
 * @param {{ days: object, adjust?: object }} log  this device
 * @param {object} others  what it knows about the other devices
 * @param {string} day  `YYYY-MM-DD`
 * @param {number} seconds  how long the day really was, from 0 to 24 hours
 * @param {number} nowMs  the moment of the correction; it is later than any earlier one of this device
 */
export function correctDay(log, others, day, seconds, nowMs) {
  if (!isDayKey(day) || !Number.isFinite(seconds) || seconds < 0 || seconds > SECONDS_IN_A_DAY) {
    return log;
  }
  let counted = log.days?.[day] ?? 0;
  // The moment of the newest correction known, of this computer or of another one
  let newestAt = log.adjust?.[day]?.at ?? 0;
  for (const device of Object.values(sanitizeDevices(others))) {
    counted += device.days[day] ?? 0;
    newestAt = Math.max(newestAt, device.adjust?.[day]?.at ?? 0);
  }
  // Later than any known correction, even if the clock of this computer is behind the other's, so
  // that this one is the one that counts
  const at = Math.max(nowMs, newestAt + 1);
  return {
    ...log,
    adjust: { ...log.adjust, [day]: { seconds: Math.round(seconds) - counted, at } },
  };
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
