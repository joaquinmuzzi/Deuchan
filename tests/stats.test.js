import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyLog } from "../extension/src/log.js";
import {
  dailyAverage,
  dashboardData,
  firstDay,
  heatmap,
  lastMonths,
  level,
  monthlyAverage,
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

test("lastMonths adds up each month, oldest first, across a year boundary", () => {
  const log = logWith({ "2026-12-31": 10, "2027-01-01": 5, "2027-01-20": 7 });
  const months = lastMonths(log, new Date(2027, 1, 3, 9), 3);
  assert.deepEqual(
    months.map(({ month, seconds }) => [month, seconds]),
    [
      ["2026-12", 10],
      ["2027-01", 12],
      ["2027-02", 0],
    ],
  );
});

test("level goes from 0 for nothing to 5 for the most", () => {
  assert.equal(level(0, 100), 0);
  assert.equal(level(1, 100), 1);
  assert.equal(level(50, 100), 3);
  assert.equal(level(100, 100), 5);
  assert.equal(level(5, 0), 0);
});

test("the heatmap has one column per week, each a Sunday to Saturday", () => {
  const weeks = heatmap(emptyLog(), TODAY, 4);
  assert.equal(weeks.length, 4);
  // 24 October 2026 is a Saturday: the last week is complete and ends today
  assert.equal(weeks[3][0].day, "2026-10-18");
  assert.equal(weeks[3][6].day, "2026-10-24");
  assert.equal(weeks[0][0].day, "2026-09-27");
});

test("the days after today are empty cells", () => {
  const wednesday = new Date(2026, 9, 21, 10);
  const last = heatmap(emptyLog(), wednesday, 2).at(-1);
  assert.equal(last[3].day, "2026-10-21");
  assert.equal(last[4], null);
  assert.equal(last[6], null);
});

test("the heatmap gives the busiest day level 5", () => {
  const log = logWith({ "2026-10-24": 600, "2026-10-23": 60 });
  const week = heatmap(log, TODAY, 1)[0];
  assert.equal(week[6].level, 5);
  assert.equal(week[5].level, 1);
  assert.equal(week[0].level, 0);
});

test("dashboardData gathers the cards, the heatmap, the week and the months", () => {
  const data = dashboardData(logWith({ "2026-10-24": 3725 }), TODAY);
  assert.equal(data.cards.today, "1:02:05");
  assert.equal(data.cards.total, "1:02:05");
  assert.equal(data.cards.dailyAverage, "1:02:05");
  assert.equal(data.heatmap.length, 27);
  assert.equal(data.week.length, 7);
  assert.equal(data.months.length, 6);
});
