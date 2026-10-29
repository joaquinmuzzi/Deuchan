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
 * Everything that comes from outside is checked (`sanitizeDevices`): it may be old, or damaged.
 */

export const SYNC_VERSION = 1;

/** More devices than this are not kept: it is the number a person could really have. */
export const MAX_DEVICES = 20;

/** A device keeps at most this many days: about thirteen years. */
export const MAX_DAYS = 5000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A day cannot have more seconds than it has. */
const SECONDS_IN_A_DAY = 24 * 3600;

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

/** `{ [deviceId]: { days } }` with only the devices and days that make sense. */
export function sanitizeDevices(devices) {
  if (!devices || typeof devices !== "object") {
    return {};
  }
  const clean = {};
  for (const [id, device] of Object.entries(devices)) {
    if (isDeviceId(id) && Object.keys(clean).length < MAX_DEVICES) {
      clean[id] = { days: sanitizeDays(device?.days) };
    }
  }
  return clean;
}

/** Puts two sets of devices together, keeping the larger value of every day of every device. */
export function mergeDevices(first, second) {
  const a = sanitizeDevices(first);
  const b = sanitizeDevices(second);
  const merged = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const days = { ...a[id]?.days };
    for (const [key, seconds] of Object.entries(b[id]?.days ?? {})) {
      days[key] = Math.max(days[key] ?? 0, seconds);
    }
    if (Object.keys(merged).length < MAX_DEVICES) {
      merged[id] = { days };
    }
  }
  return merged;
}

/** What this device sends: everything it knows, its own days included. */
export function blobOf(deviceId, log, others) {
  return {
    version: SYNC_VERSION,
    devices: mergeDevices(others, { [deviceId]: { days: log?.days } }),
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

/** The log to show: the days of this device plus the days of all the others. */
export function effectiveLog(log, others) {
  const days = { ...log?.days };
  for (const device of Object.values(sanitizeDevices(others))) {
    for (const [key, seconds] of Object.entries(device.days)) {
      days[key] = (days[key] ?? 0) + seconds;
    }
  }
  return { ...log, days };
}

/** A new device id, for the first time the extension runs. */
export const newDeviceId = () => crypto.randomUUID();
