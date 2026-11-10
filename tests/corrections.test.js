import assert from "node:assert/strict";
import { test } from "node:test";

import { correctDay, dayTotal, isDayKey, parseDayMinutes } from "../extension/src/corrections.js";
import { migrate } from "../extension/src/log.js";
import {
  blobOf,
  effectiveLog,
  mergeDevices,
  receive,
  sanitizeAdjust,
  sanitizeDevices,
} from "../extension/src/sync-data.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DAY = "2026-10-24";

const logWith = (days, adjust) => (adjust ? { version: 1, days, adjust } : { version: 1, days });

test("a corrected day shows what the person said", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 900, 1000);
  assert.equal(dayTotal(log, {}, DAY), 900);
  assert.equal(log.days[DAY], 4000, "what was counted is not touched, only corrected");
});

test("the given log is not changed", () => {
  const log = logWith({ [DAY]: 4000 });
  correctDay(log, {}, DAY, 900, 1000);
  assert.deepEqual(log, logWith({ [DAY]: 4000 }));
});

test("the time of another computer is corrected too, and the day shows the same on both", () => {
  const a = logWith({ [DAY]: 600 });
  const b = logWith({ [DAY]: 3600 });
  // the person is on A and says the day was 15 minutes in total; B counted most of it
  const corrected = correctDay(a, { [B]: { days: b.days } }, DAY, 900, 1000);
  const forA = effectiveLog(corrected, { [B]: { days: b.days } });
  const forB = effectiveLog(b, receive({}, blobOf(A, corrected, {}), B));
  assert.equal(forA.days[DAY], 900);
  assert.equal(forB.days[DAY], 900);
});

test("a correction that is lowered stays lowered after syncing, which a smaller number could not do", () => {
  // what the days alone do: the larger copy wins and the day comes back
  const stale = mergeDevices({ [A]: { days: { [DAY]: 4000 } } }, { [A]: { days: { [DAY]: 900 } } });
  assert.equal(stale[A].days[DAY], 4000);

  const log = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 900, 1000);
  const merged = mergeDevices({ [A]: { days: { [DAY]: 4000 } } }, blobOf(A, log, {}).devices);
  assert.equal(effectiveLog(logWith({}), merged).days[DAY], 900);
});

test("time counted after the correction is added on top", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 900, 1000);
  const later = { ...log, days: { [DAY]: 4000 + 120 } };
  assert.equal(dayTotal(later, {}, DAY), 1020);
});

test("a day can be corrected to zero and the day disappears from the log", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 0, 1000);
  assert.equal(dayTotal(log, {}, DAY), 0);
  assert.ok(!(DAY in effectiveLog(log, {}).days));
});

test("a correction can be corrected again, and the last one wins even if the clock went back", () => {
  const first = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 900, 5000);
  const second = correctDay(first, {}, DAY, 1800, 1000);
  assert.equal(dayTotal(second, {}, DAY), 1800);
  assert.ok(second.adjust[DAY].at > first.adjust[DAY].at);
  // and in the copy of another computer, which had the first one
  const merged = mergeDevices(blobOf(A, first, {}).devices, blobOf(A, second, {}).devices);
  assert.equal(effectiveLog(logWith({}), merged).days[DAY], 1800);
});

test("the newer correction wins whichever order two copies are put together", () => {
  const older = { [A]: { days: {}, adjust: { [DAY]: { seconds: -100, at: 10 } } } };
  const newer = { [A]: { days: {}, adjust: { [DAY]: { seconds: -300, at: 20 } } } };
  assert.deepEqual(mergeDevices(older, newer), newer);
  assert.deepEqual(mergeDevices(newer, older), newer);
  assert.deepEqual(mergeDevices(newer, newer), newer);
});

test("a correction that does not make sense changes nothing", () => {
  const log = logWith({ [DAY]: 4000 });
  for (const [day, seconds] of [
    ["yesterday", 60],
    [DAY, -1],
    [DAY, 86_401],
    [DAY, Number.NaN],
    [DAY, "60"],
  ]) {
    assert.equal(correctDay(log, {}, day, seconds, 1000), log, `${day} ${seconds}`);
  }
});

test("sanitizeAdjust keeps what makes sense, and nothing that can be a dangerous key", () => {
  const dirty = JSON.parse(
    `{"${DAY}":{"seconds":-60.4,"at":5},"bad":{"seconds":1,"at":1},"2026-10-23":{"seconds":"x","at":1},"2026-10-22":{"seconds":1,"at":0},"__proto__":{"seconds":1,"at":1},"2026-10-21":null}`,
  );
  assert.deepEqual(sanitizeAdjust(dirty), { [DAY]: { seconds: -60.4, at: 5 } });
  for (const bad of [undefined, null, 5, "x"]) {
    assert.deepEqual(sanitizeAdjust(bad), {});
  }
});

test("sanitizeDevices keeps the corrections of a device, and a device with none stays as it was", () => {
  const devices = sanitizeDevices({
    [A]: { days: {}, adjust: { [DAY]: { seconds: -5, at: 3 } } },
    [B]: { days: { [DAY]: 5 }, adjust: {} },
  });
  assert.deepEqual(devices[A].adjust, { [DAY]: { seconds: -5, at: 3 } });
  assert.deepEqual(devices[B], { days: { [DAY]: 5 } });
});

test("the log of this device keeps its corrections when it is read from the storage", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 900, 1000);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(log))), log);
  assert.deepEqual(migrate(logWith({ [DAY]: 5 })), logWith({ [DAY]: 5 }));
});

test("a log from before the corrections works, and shows no corrections of its own", () => {
  const shown = effectiveLog(logWith({ [DAY]: 5 }), {});
  assert.deepEqual(shown, logWith({ [DAY]: 5 }));
  assert.ok(!("adjust" in effectiveLog(correctDay(logWith({ [DAY]: 5 }), {}, DAY, 1, 1), {})));
});

test("a day key is a date, and minutes are a whole number up to a day", () => {
  assert.equal(isDayKey(DAY), true);
  for (const bad of ["", "2026-1-1", "today", null, 5]) {
    assert.equal(isDayKey(bad), false);
  }
  assert.equal(parseDayMinutes(" 15 "), 15);
  assert.equal(parseDayMinutes("0"), 0);
  assert.equal(parseDayMinutes("1440"), 1440);
  for (const bad of ["", "1441", "-1", "1.5", "abc", "99999", null]) {
    assert.equal(parseDayMinutes(bad), null, String(bad));
  }
});

test("correcting the same day on two computers does not add the corrections up: the newest one counts", () => {
  // what really happened: 4659 seconds counted, and each computer was told the day was 15 and 14
  // minutes, before knowing about the other
  const counted = 4659.2449996471405;
  const first = correctDay(logWith({ [DAY]: counted }), {}, DAY, 900, 1000);
  const second = correctDay(logWith({}), { [A]: { days: { [DAY]: counted } } }, DAY, 840, 2000);
  const onA = effectiveLog(first, { [B]: { days: {}, adjust: second.adjust } });
  const onB = effectiveLog(second, { [A]: { days: { [DAY]: counted }, adjust: first.adjust } });
  assert.equal(Math.round(onA.days[DAY]), 840);
  assert.equal(Math.round(onB.days[DAY]), 840);
  // and the other way round, if the 15 minutes were the later one
  const later = correctDay(logWith({ [DAY]: counted }), {}, DAY, 900, 3000);
  assert.equal(Math.round(effectiveLog(later, { [B]: { days: {}, adjust: second.adjust } }).days[DAY]), 900);
});

test("a correction made on a computer whose clock is behind still counts as the newest", () => {
  const first = correctDay(logWith({ [DAY]: 4000 }), {}, DAY, 900, 50_000);
  const known = { [A]: { days: {}, adjust: first.adjust } };
  // this clock says 1000, a minute behind the other's
  const second = correctDay(logWith({ [DAY]: 0 }), known, DAY, 1800, 1000);
  assert.ok(second.adjust[DAY].at > first.adjust[DAY].at);
  assert.equal(effectiveLog(second, known).days[DAY], 1800);
});
