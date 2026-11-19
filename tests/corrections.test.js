import assert from "node:assert/strict";
import { test } from "node:test";

import { correctDay, isDayKey, parseDayMinutes } from "../extension/src/corrections.js";
import { localizeCorrections } from "../extension/src/legacy-sync.js";
import { migrate, sanitizeAdjust, shownLog } from "../extension/src/log.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DAY = "2026-10-24";

const logWith = (days, adjust) => (adjust ? { version: 1, days, adjust } : { version: 1, days });
const shown = (log) => shownLog(log).days[DAY] ?? 0;

test("a corrected day shows what the person said", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), DAY, 900, 1000);
  assert.equal(shown(log), 900);
  assert.equal(log.days[DAY], 4000, "what was counted is not touched, only corrected");
});

test("the given log is not changed", () => {
  const log = logWith({ [DAY]: 4000 });
  correctDay(log, DAY, 900, 1000);
  assert.deepEqual(log, logWith({ [DAY]: 4000 }));
});

test("the other computers keep their time: only what this one counted is corrected", () => {
  // The day shows 1 hour: 40 minutes here and 20 on another computer. The person says it was 30.
  const log = correctDay(logWith({ [DAY]: 2400 }), DAY, 1800, 1000, 1200);
  assert.equal(shown(log), 600);
  // and it cannot take away more than this computer has
  assert.equal(shown(correctDay(logWith({ [DAY]: 2400 }), DAY, 600, 1000, 1200)), 0);
});

test("time counted after the correction is added on top", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), DAY, 900, 1000);
  const later = { ...log, days: { [DAY]: 4000 + 120 } };
  assert.equal(shown(later), 1020);
});

test("a day can be corrected to zero and the day disappears from the log", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), DAY, 0, 1000);
  assert.ok(!(DAY in shownLog(log).days));
});

test("a correction can be corrected again, and the last one wins even if the clock went back", () => {
  const first = correctDay(logWith({ [DAY]: 4000 }), DAY, 900, 5000);
  const second = correctDay(first, DAY, 1800, 1000);
  assert.equal(shown(second), 1800);
  assert.ok(second.adjust[DAY].at > first.adjust[DAY].at);
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
    assert.equal(correctDay(log, day, seconds, 1000), log, `${day} ${seconds}`);
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

test("the log keeps its corrections when it is read from the storage", () => {
  const log = correctDay(logWith({ [DAY]: 4000 }), DAY, 900, 1000);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(log))), log);
  assert.deepEqual(migrate(logWith({ [DAY]: 5 })), logWith({ [DAY]: 5 }));
});

test("a log with no corrections shows what was counted, and no corrections", () => {
  assert.deepEqual(shownLog(logWith({ [DAY]: 5 })), logWith({ [DAY]: 5 }));
  assert.ok(!("adjust" in shownLog(correctDay(logWith({ [DAY]: 5 }), DAY, 1, 1))));
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

test("leaving the old sync, a corrected day keeps the share of what each computer counted", () => {
  // 1 hour here and 3 on the other computer, corrected on the other one to 2 hours in total
  const others = { [A]: { days: { [DAY]: 3 * 3600 }, adjust: { [DAY]: { seconds: -2 * 3600, at: 50 } } } };
  const here = localizeCorrections(logWith({ [DAY]: 3600 }), others, 100);
  assert.equal(shown(here), 1800);
  // the other computer does the same with its own share, and the day still adds up to 2 hours
  const there = localizeCorrections(
    logWith({ [DAY]: 3 * 3600 }, others[A].adjust),
    { x: { days: { [DAY]: 3600 } } },
    100,
  );
  assert.equal(shown(there) + shown(here), 2 * 3600);
});

test("leaving the old sync, a day with nothing counted belongs to the computer that corrected it", () => {
  const mine = localizeCorrections(logWith({}, { [DAY]: { seconds: 600, at: 50 } }), {}, 100);
  assert.equal(shown(mine), 600);
  const theirs = localizeCorrections(
    logWith({}),
    { [A]: { days: {}, adjust: { [DAY]: { seconds: 600, at: 50 } } } },
    100,
  );
  assert.equal(shown(theirs), 0);
  assert.ok(!("adjust" in theirs));
});

test("leaving the old sync, a day nobody corrected stays as it was", () => {
  const log = logWith({ [DAY]: 3600 });
  assert.deepEqual(localizeCorrections(log, { [A]: { days: { [DAY]: 60 } } }, 100), log);
  assert.deepEqual(localizeCorrections(log, undefined, 100), log);
});
