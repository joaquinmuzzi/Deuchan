/**
 * How the time of several computers is put together.
 *
 * Every computer ("device") counts its own time, in its own `log`, and never changes what another
 * computer counted. What it knows about the others is kept apart, in `others`, which has the days of
 * each other device: `{ [deviceId]: { days: { "2026-10-24": 3600 } } }`. What the popup and the
 * dashboard show is the sum of both (`effectiveLog`).
 *
 * To share, each device sends everything it knows (its own days and the ones of the others) and
 * receives the same from the rest. The days of a device only ever grow, as time is only added, so
 * when two copies of the same day differ, the larger one is the newer: that is the whole rule
 * (`mergeDevices`). It can be repeated any number of times, in any order, and nothing is counted
 * twice. If a computer is reinstalled it is a new device, and what the old one counted stays.
 *
 * The days only grow, so a day cannot be lowered by writing a smaller number: the larger copy would
 * win again. A correction is kept apart, as `adjust`: for a day, a number of seconds (negative to
 * take time away) that is added to the sum of the devices, with the moment it was made. The newer
 * copy of an adjustment wins, so it can be changed and undone. Each device only makes its own.
 *
 * Everything that comes from outside is checked (`sanitizeDevices`): it may be old, or damaged.
 */

export const SYNC_VERSION = 2;

/** More devices than this are not kept: it is the number a person could really have. */
export const MAX_DEVICES = 20;

/** A device keeps at most this many days: about thirteen years. */
export const MAX_DAYS = 5000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A day cannot have more seconds than it has. */
const SECONDS_IN_A_DAY = 24 * 3600;

/** The corrections of a device, and what they add or take away from the time of a day. */
const MAX_ADJUST_SECONDS = 7 * SECONDS_IN_A_DAY;

export const isDeviceId = (value) => typeof value === "string" && DEVICE_ID.test(value);

/** The days that make sense: a date, and some seconds, at most a day. The rest is dropped. */
export function sanitizeDays(days) {
  if (!days || typeof days !== "object") {
    return {};
  }
  const clean = {};
  for (const [key, seconds] of Object.entries(days).slice(0, MAX_DAYS)) {
    if (DAY.test(key) && Number.isFinite(seconds) && seconds > 0) {
      clean[key] = Math.min(seconds, SECONDS_IN_A_DAY);
    }
  }
  return clean;
}

/**
 * The corrections that make sense: `{ "2026-10-24": { seconds: -900, at: 1761300000000 } }`, a date,
 * a number of seconds (zero undoes a correction) and when it was made, in milliseconds.
 */
export function sanitizeAdjust(adjust) {
  if (!adjust || typeof adjust !== "object") {
    return {};
  }
  const clean = {};
  for (const [key, entry] of Object.entries(adjust).slice(0, MAX_DAYS)) {
    const { seconds, at } = entry ?? {};
    if (DAY.test(key) && Number.isFinite(seconds) && Number.isFinite(at) && at > 0) {
      clean[key] = {
        seconds: Math.max(-MAX_ADJUST_SECONDS, Math.min(MAX_ADJUST_SECONDS, seconds)),
        at,
      };
    }
  }
  return clean;
}

/** Of two copies of a correction, the newer one; if they were made at the same moment, the smaller. */
const newerAdjustment = (first, second) =>
  !first || second.at > first.at || (second.at === first.at && second.seconds < first.seconds)
    ? second
    : first;

/** `{ [deviceId]: { days, adjust? } }` with only the devices, days and corrections that make sense. */
export function sanitizeDevices(devices) {
  if (!devices || typeof devices !== "object") {
    return {};
  }
  const clean = {};
  for (const [id, device] of Object.entries(devices)) {
    if (isDeviceId(id) && Object.keys(clean).length < MAX_DEVICES) {
      const adjust = sanitizeAdjust(device?.adjust);
      clean[id] = { days: sanitizeDays(device?.days) };
      if (Object.keys(adjust).length > 0) {
        clean[id].adjust = adjust;
      }
    }
  }
  return clean;
}

/**
 * Puts two sets of devices together, keeping the larger value of every day of every device and the
 * newer copy of every correction.
 */
export function mergeDevices(first, second) {
  const a = sanitizeDevices(first);
  const b = sanitizeDevices(second);
  const merged = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const days = { ...a[id]?.days };
    for (const [key, seconds] of Object.entries(b[id]?.days ?? {})) {
      days[key] = Math.max(days[key] ?? 0, seconds);
    }
    const adjust = { ...a[id]?.adjust };
    for (const [key, entry] of Object.entries(b[id]?.adjust ?? {})) {
      adjust[key] = newerAdjustment(adjust[key], entry);
    }
    if (Object.keys(merged).length < MAX_DEVICES) {
      merged[id] = { days };
      if (Object.keys(adjust).length > 0) {
        merged[id].adjust = adjust;
      }
    }
  }
  return merged;
}

/** What this device sends: everything it knows, its own days included. */
export function blobOf(deviceId, log, others) {
  return {
    version: SYNC_VERSION,
    devices: mergeDevices(others, { [deviceId]: { days: log?.days, adjust: log?.adjust } }),
  };
}

/** What a received copy says about the other devices (the own one is not taken from outside). */
export function othersFrom(blob, deviceId) {
  const devices = sanitizeDevices(blob?.devices);
  delete devices[deviceId];
  return devices;
}

/** The knowledge about the other devices after receiving `blob`: what was known and what came. */
export function receive(others, blob, deviceId) {
  return mergeDevices(others, othersFrom(blob, deviceId));
}

/**
 * The log to show: the days of this device plus the days of all the others, with the corrections of
 * all of them. A corrected day cannot go below zero, and a day with no time is not in the log.
 */
export function effectiveLog(log, others) {
  const days = { ...log?.days };
  const adjustments = [sanitizeAdjust(log?.adjust)];
  for (const device of Object.values(sanitizeDevices(others))) {
    for (const [key, seconds] of Object.entries(device.days)) {
      days[key] = (days[key] ?? 0) + seconds;
    }
    adjustments.push(device.adjust ?? {});
  }
  for (const adjust of adjustments) {
    for (const [key, { seconds }] of Object.entries(adjust)) {
      days[key] = (days[key] ?? 0) + seconds;
    }
  }
  for (const [key, seconds] of Object.entries(days)) {
    if (!(seconds > 0)) {
      delete days[key];
    }
  }
  const shown = { ...log, days };
  delete shown.adjust;
  return shown;
}

/** A new device id, for the first time the extension runs. */
export const newDeviceId = () => crypto.randomUUID();
