/**
 * The extension used to sync the time of several computers itself, through a server of its own. Now every
 * computer sends to Mosaik, which adds them up, and this is what is left to move the old data: once,
 * when the extension updates.
 *
 * The old sync kept what the other computers counted in `others`, and a correction of a day was made on
 * the sum of all of them. Each computer now keeps only its own time, so a corrected day keeps the share
 * of what this computer had counted: if the day was corrected from 2 hours to 1, a computer that had
 * counted 30 minutes of it keeps 15. Every computer does the same, so the day still adds up to what the
 * person said.
 */
import { sanitizeAdjust } from "./log.js";

/** What is kept of the old sync, and goes away once it is moved. */
export const LEGACY_KEYS = ["syncKey", "syncState", "deviceId", "others"];

/** The old alarms of the sync. */
export const LEGACY_ALARMS = ["deuchan-sync", "deuchan-sync-soon"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The days and corrections of the other computers that still make sense. */
function legacyDevices(others) {
  if (!others || typeof others !== "object") {
    return [];
  }
  return Object.values(others).map((device) => ({
    days: Object.fromEntries(
      Object.entries(device?.days ?? {}).filter(
        ([key, seconds]) => DAY.test(key) && Number.isFinite(seconds) && seconds > 0,
      ),
    ),
    adjust: sanitizeAdjust(device?.adjust),
  }));
}

/**
 * The log of this computer with its corrections made on its own time only.
 *
 * @param {{ days: object, adjust?: object }} log  this computer, as `migrate` leaves it
 * @param {object} others  what the old sync knew of the other computers
 * @param {number} nowMs
 */
export function localizeCorrections(log, others, nowMs) {
  const devices = legacyDevices(others);
  const own = sanitizeAdjust(log.adjust);
  const days = new Set([...Object.keys(own), ...devices.flatMap((device) => Object.keys(device.adjust))]);
  const adjust = {};
  for (const day of days) {
    // Of all the corrections of a day only the newest counted
    let newest = own[day] ? { ...own[day], mine: true } : null;
    for (const device of devices) {
      const entry = device.adjust[day];
      if (entry && (!newest || entry.at > newest.at)) {
        newest = { ...entry, mine: false };
      }
    }
    const mine = log.days[day] ?? 0;
    const counted = mine + devices.reduce((sum, device) => sum + (device.days[day] ?? 0), 0);
    const shown = Math.max(0, counted + newest.seconds);
    // The share of this computer; a day with nothing counted belongs to the one that corrected it
    const share = counted > 0 ? mine / counted : newest.mine ? 1 : 0;
    const keep = Math.round(shown * share);
    if (keep !== Math.round(mine)) {
      adjust[day] = { seconds: keep - mine, at: nowMs };
    }
  }
  const rest = { ...log };
  delete rest.adjust;
  return Object.keys(adjust).length > 0 ? { ...rest, adjust } : rest;
}
