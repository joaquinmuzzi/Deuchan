import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyLog } from "../extension/src/log.js";
import {
  DEFAULT_RANGE,
  HEATMAP_MONTHS,
  RANGES,
  dailyAverage,
  dashboardData,
  daysMeetingGoal,
  firstDay,
  groupSize,
  heatmap,
  level,
  monthlyAverage,
  timeline,
  weekdayAverages,
} from "../extension/src/stats.js";

const TODAY = new Date(2026, 9, 24, 15, 30); // Saturday, 24 October 2026

const logWith = (days) => ({ version: 1, days });

test("firstDay is the oldest day, or null", () => {
  assert.equal(firstDay(emptyLog()), null);
  assert.equal(firstDay(logWith({ "2026-10-24": 5, "2026-09-02": 5 })), "2026-09-02");
});

test("the daily average counts every day since the first, empty ones too", () => {
  const log = logWith({ "2026-10-21": 400, "2026-10-24": 400 }); // 4 days: 21, 22, 23, 24
  assert.equal(dailyAverage(log, TODAY), 200);
  assert.equal(dailyAverage(emptyLog(), TODAY), 0);
});

test("the daily average of a first day today is that day", () => {
  assert.equal(dailyAverage(logWith({ "2026-10-24": 90 }), TODAY), 90);
});

test("the monthly average counts every month since the first, this one included", () => {
  const log = logWith({ "2026-08-15": 300, "2026-10-01": 300 }); // August, September, October
  assert.equal(monthlyAverage(log, TODAY), 200);
  assert.equal(monthlyAverage(emptyLog(), TODAY), 0);
});

test("level goes from 0 for nothing to 5 for the most", () => {
  assert.equal(level(0, 100), 0);
  assert.equal(level(1, 100), 1);
  assert.equal(level(50, 100), 3);
  assert.equal(level(100, 100), 5);
  assert.equal(level(5, 0), 0);
});

test("the heatmap has one block per month, the last one this month", () => {
  const months = heatmap(emptyLog(), TODAY, 3);
  assert.deepEqual(
    months.map(({ month }) => month),
    ["2026-08", "2026-09", "2026-10"],
  );
});

test("a month starts on the weekday of the 1st, with the days before it empty", () => {
  // 1 August 2026 is a Saturday
  const august = heatmap(emptyLog(), TODAY, 3)[0];
  assert.deepEqual(august.weeks[0].slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(august.weeks[0][6].day, "2026-08-01");
  // the next column is a whole week, Sunday the 2nd to Saturday the 8th
  assert.equal(august.weeks[1][0].day, "2026-08-02");
  assert.equal(august.weeks[1][6].day, "2026-08-08");
});

test("a month ends on its last day, and a week across two months is split", () => {
  const august = heatmap(emptyLog(), TODAY, 3)[0];
  const september = heatmap(emptyLog(), TODAY, 3)[1];
  // 31 August 2026 is a Monday: the last column has Sunday the 30th and Monday the 31st
  const last = august.weeks.at(-1);
  assert.equal(last[0].day, "2026-08-30");
  assert.equal(last[1].day, "2026-08-31");
  assert.equal(last[2], null);
  // 1 September is a Tuesday: its first column starts there, while the 30th and 31st are in August
  assert.equal(september.weeks[0][1], null);
  assert.equal(september.weeks[0][2].day, "2026-09-01");
});

test("every day of every month is in the heatmap once", () => {
  const days = heatmap(emptyLog(), TODAY, 3)
    .flatMap(({ weeks }) => weeks.flat())
    .filter(Boolean)
    .map((cell) => cell.day);
  assert.equal(new Set(days).size, days.length);
  assert.equal(days.length, 31 + 30 + 24); // August, September and October up to the 24th
});

test("the current month stops at today", () => {
  const wednesday = new Date(2026, 9, 21, 10);
  const october = heatmap(emptyLog(), wednesday, 1)[0];
  const days = october.weeks.flat().filter(Boolean);
  assert.equal(days.at(-1).day, "2026-10-21");
  assert.equal(days.length, 21);
});

test("the heatmap gives the busiest day level 5", () => {
  const log = logWith({ "2026-10-24": 600, "2026-10-23": 60 });
  const cells = heatmap(log, TODAY, 1)[0].weeks.flat().filter(Boolean);
  assert.equal(cells.find((cell) => cell.day === "2026-10-24").level, 5);
  assert.equal(cells.find((cell) => cell.day === "2026-10-23").level, 1);
  assert.equal(cells.find((cell) => cell.day === "2026-10-01").level, 0);
});

test("the default range is one of the ranges, and is 15 days", () => {
  assert.equal(DEFAULT_RANGE, 15);
  assert.ok(RANGES.some(({ days }) => days === DEFAULT_RANGE));
});

test("up to 3 months there is a bar per day, and a year has 4 days per bar", () => {
  for (const { days } of RANGES.filter(({ days }) => days <= 90)) {
    assert.equal(groupSize(days), 1, String(days));
  }
  assert.equal(groupSize(365), 4);
});

test("timeline has one bar per day, the oldest first, ending today", () => {
  const log = logWith({ "2026-10-24": 60, "2026-10-22": 30 });
  const bars = timeline(log, TODAY, 3);
  assert.deepEqual(
    bars.map(({ from, seconds }) => [from, seconds]),
    [
      ["2026-10-22", 30],
      ["2026-10-23", 0],
      ["2026-10-24", 60],
    ],
  );
});

test("timeline groups days, with the newest bar full and the oldest short", () => {
  const log = logWith({ "2026-10-24": 40, "2026-10-23": 40, "2026-10-21": 80, "2026-10-17": 100 });
  const bars = timeline(log, TODAY, 10, 4); // 10 days, 15 to 24: bars of 2, 4 and 4 days
  assert.equal(bars.length, 3);
  assert.deepEqual(
    bars.map(({ from, to }) => [from, to]),
    [
      ["2026-10-15", "2026-10-16"],
      ["2026-10-17", "2026-10-20"],
      ["2026-10-21", "2026-10-24"],
    ],
  );
  assert.equal(bars[2].seconds, 160);
  assert.equal(bars[2].perDay, 40);
  assert.equal(bars[0].perDay, 0);
});

test("a year of days makes 92 bars", () => {
  assert.equal(timeline(emptyLog(), TODAY, 365).length, 92);
  assert.equal(timeline(emptyLog(), TODAY, 365).at(0).from, "2025-10-25");
});

test("weekdayAverages starts on Monday and counts empty days", () => {
  // 20 October 2026 is a Tuesday; the log starts on Monday the 19th
  const log = logWith({ "2026-10-19": 600, "2026-10-20": 1200 });
  const averages = weekdayAverages(log, TODAY); // days: 19 to 24, one of each weekday up to Saturday
  assert.deepEqual(averages, [600, 1200, 0, 0, 0, 0, 0]);
});

test("weekdayAverages averages the same weekday over several weeks", () => {
  const log = logWith({ "2026-10-12": 600, "2026-10-19": 1200 }); // two Mondays; 12 Oct is the first day
  assert.equal(weekdayAverages(log, TODAY)[0], 900);
});

test("weekdayAverages of an empty log is all zeros", () => {
  assert.deepEqual(weekdayAverages(emptyLog(), TODAY), [0, 0, 0, 0, 0, 0, 0]);
});

test("daysMeetingGoal counts the days that reached the goal", () => {
  const log = logWith({ "2026-10-24": 1800, "2026-10-23": 1799, "2026-10-22": 3000 });
  assert.equal(daysMeetingGoal(log, TODAY, 7, 1800), 2);
});

test("dashboardData gathers the cards, the heatmap and the weekdays", () => {
  const data = dashboardData(logWith({ "2026-10-24": 3725 }), TODAY);
  assert.equal(data.cards.today, "1:02:05");
  assert.equal(data.cards.total, "1:02:05");
  assert.equal(data.cards.dailyAverage, "1:02:05");
  assert.equal(data.heatmap.length, HEATMAP_MONTHS);
  assert.equal(data.weekdays.length, 7);
});
