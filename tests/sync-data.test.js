import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyLog, migrate } from "../extension/src/log.js";
import { dashboardData, timeline } from "../extension/src/stats.js";
import {
  MAX_DAYS,
  MAX_DEVICES,
  SYNC_VERSION,
  blobOf,
  effectiveLog,
  isDeviceId,
  mergeDevices,
  newDeviceId,
  othersFrom,
  receive,
  sanitizeDays,
  sanitizeDevices,
} from "../extension/src/sync-data.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const logWith = (days) => ({ version: 1, days });
const device = (days) => ({ days });

test("a device id is a lowercase uuid, and the ones we make are", () => {
  assert.equal(isDeviceId(A), true);
  assert.equal(isDeviceId(newDeviceId()), true);
  for (const id of ["", "abc", A.toUpperCase(), `${A}x`, "__proto__", "constructor", 5, null, undefined]) {
    assert.equal(isDeviceId(id), false, String(id));
  }
});

test("sanitizeDays keeps real days with seconds and drops the rest", () => {
  const days = { "2026-10-24": 60, tomorrow: 5, "2026-10-23": -1, "2026-10-22": "9", "2026-10-21": NaN };
  assert.deepEqual(sanitizeDays(days), { "2026-10-24": 60 });
  for (const bad of [undefined, null, 5, "x"]) {
    assert.deepEqual(sanitizeDays(bad), {});
  }
});

test("a day cannot have more than 24 hours", () => {
  assert.deepEqual(sanitizeDays({ "2026-10-24": 999_999 }), { "2026-10-24": 86_400 });
});

test("sanitizeDays keeps a limited number of days", () => {
  const days = {};
  for (let index = 0; index < MAX_DAYS + 10; index += 1) {
    days[
      `${2000 + Math.floor(index / 366)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`
    ] = 5;
  }
  assert.ok(Object.keys(sanitizeDays(days)).length <= MAX_DAYS);
});

test("sanitizeDevices keeps valid devices only, and no id can be a dangerous key", () => {
  const dirty = JSON.parse(
    `{"${A}":{"days":{"2026-10-24":60}},"__proto__":{"days":{"2026-10-24":1}},"nope":{"days":{}},"${B}":null}`,
  );
  assert.deepEqual(sanitizeDevices(dirty), { [A]: device({ "2026-10-24": 60 }), [B]: device({}) });
  assert.deepEqual(Object.getPrototypeOf(sanitizeDevices(dirty)), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test("sanitizeDevices keeps a limited number of devices", () => {
  const devices = {};
  for (let index = 0; index < MAX_DEVICES + 5; index += 1) {
    devices[`${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`] = device({ "2026-10-24": 1 });
  }
  assert.equal(Object.keys(sanitizeDevices(devices)).length, MAX_DEVICES);
});

test("mergeDevices keeps the larger value of every day of every device", () => {
  const first = { [A]: device({ "2026-10-23": 100, "2026-10-24": 50 }) };
  const second = { [A]: device({ "2026-10-24": 80, "2026-10-25": 10 }), [B]: device({ "2026-10-24": 7 }) };
  assert.deepEqual(mergeDevices(first, second), {
    [A]: device({ "2026-10-23": 100, "2026-10-24": 80, "2026-10-25": 10 }),
    [B]: device({ "2026-10-24": 7 }),
  });
});

test("merging is the same in any order, repeated, and with nothing", () => {
  const first = { [A]: device({ "2026-10-24": 50 }), [B]: device({ "2026-10-23": 9 }) };
  const second = { [A]: device({ "2026-10-24": 80 }), [C]: device({ "2026-10-22": 4 }) };
  const once = mergeDevices(first, second);
  assert.deepEqual(mergeDevices(second, first), once, "commutative");
  assert.deepEqual(mergeDevices(once, second), once, "idempotent");
  assert.deepEqual(mergeDevices(once, first), once, "idempotent, the other side");
  assert.deepEqual(mergeDevices(once, {}), once, "with nothing");
  assert.deepEqual(mergeDevices(undefined, once), once, "from nothing");
});

test("a total is never counted twice, however many times two devices sync", () => {
  // Device A watched 100 s, device B watched 40 s, on the same day, and they sync again and again
  let a = { log: logWith({ "2026-10-24": 100 }), others: {} };
  let b = { log: logWith({ "2026-10-24": 40 }), others: {} };
  for (let round = 0; round < 3; round += 1) {
    const fromA = blobOf(A, a.log, a.others);
    const fromB = blobOf(B, b.log, b.others);
    a = { ...a, others: receive(a.others, fromB, A) };
    b = { ...b, others: receive(b.others, fromA, B) };
  }
  assert.equal(effectiveLog(a.log, a.others).days["2026-10-24"], 140);
  assert.equal(effectiveLog(b.log, b.others).days["2026-10-24"], 140);
});

test("time counted after a sync is added, and the old time is not", () => {
  let a = { log: logWith({ "2026-10-24": 100 }), others: {} };
  let b = { log: logWith({ "2026-10-24": 40 }), others: {} };
  b = { ...b, others: receive(b.others, blobOf(A, a.log, a.others), B) };
  a = { ...a, others: receive(a.others, blobOf(B, b.log, b.others), A) };
  b = { ...b, log: logWith({ "2026-10-24": 70 }) }; // B watches 30 s more
  a = { ...a, others: receive(a.others, blobOf(B, b.log, b.others), A) };
  assert.equal(effectiveLog(a.log, a.others).days["2026-10-24"], 170);
});

test("a third device gets what the first two counted, through either", () => {
  const a = { log: logWith({ "2026-10-24": 100 }), others: {} };
  const b = { log: logWith({ "2026-10-24": 40 }), others: receive({}, blobOf(A, a.log, {}), B) };
  // C only talks to B, which already knows A
  const c = { log: emptyLog(), others: receive({}, blobOf(B, b.log, b.others), C) };
  assert.equal(effectiveLog(c.log, c.others).days["2026-10-24"], 140);
});

test("othersFrom never takes the own device from outside", () => {
  const blob = {
    version: SYNC_VERSION,
    devices: { [A]: device({ "2026-10-24": 999 }), [B]: device({ "2026-10-24": 5 }) },
  };
  assert.deepEqual(othersFrom(blob, A), { [B]: device({ "2026-10-24": 5 }) });
});

test("othersFrom copes with a damaged copy", () => {
  for (const blob of [undefined, null, {}, { devices: null }, { devices: 5 }, "x"]) {
    assert.deepEqual(othersFrom(blob, A), {});
  }
});

test("blobOf has the days of this device and of the ones it knows", () => {
  const blob = blobOf(A, logWith({ "2026-10-24": 100 }), { [B]: device({ "2026-10-23": 9 }) });
  assert.equal(blob.version, SYNC_VERSION);
  assert.deepEqual(blob.devices, {
    [A]: device({ "2026-10-24": 100 }),
    [B]: device({ "2026-10-23": 9 }),
  });
});

test("blobOf works with no log yet", () => {
  assert.deepEqual(blobOf(A, undefined, undefined).devices, { [A]: device({}) });
});

test("effectiveLog adds the days of the others to the own, without changing what was given", () => {
  const log = logWith({ "2026-10-24": 100, "2026-10-23": 5 });
  const others = { [B]: device({ "2026-10-24": 40, "2026-10-22": 7 }), [C]: device({ "2026-10-24": 2 }) };
  const total = effectiveLog(log, others);
  assert.deepEqual(total.days, { "2026-10-24": 142, "2026-10-23": 5, "2026-10-22": 7 });
  assert.equal(total.version, 1);
  assert.deepEqual(log.days, { "2026-10-24": 100, "2026-10-23": 5 });
});

test("effectiveLog is the log itself when there are no others, and works with nothing", () => {
  assert.deepEqual(effectiveLog(logWith({ "2026-10-24": 5 }), undefined).days, { "2026-10-24": 5 });
  assert.deepEqual(effectiveLog(undefined, undefined).days, {});
  assert.deepEqual(effectiveLog(emptyLog(), {}).days, {});
});

test("effectiveLog ignores damaged data about the others", () => {
  const others = { nope: device({ "2026-10-24": 9 }), [B]: device({ tomorrow: 9, "2026-10-24": 3 }) };
  assert.deepEqual(effectiveLog(logWith({}), others).days, { "2026-10-24": 3 });
});

test("a new install, with nothing saved yet, gives a log that the dashboard can draw", () => {
  // The storage has no log and no others at all until the first video is watched
  const log = effectiveLog(migrate(undefined), undefined);
  const today = new Date(2026, 9, 24);
  assert.equal(timeline(log, today, 15).length, 15);
  assert.equal(dashboardData(log, today).cards.today, "0:00");
});
