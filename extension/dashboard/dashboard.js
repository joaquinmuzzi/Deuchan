import { formatClock, migrate } from "../src/log.js";
import { dashboardData } from "../src/stats.js";
import { setUpTheme } from "../src/theme.js";

const byId = (id) => document.getElementById(id);
const english = (options) => new Intl.DateTimeFormat("en", options);
const weekdayName = english({ weekday: "short" });
const monthName = english({ month: "short" });

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** The date of a `YYYY-MM-DD` key, at noon so that the time zone cannot change the day. */
const dateOf = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

function renderHeatmap(weeks) {
  let lastMonth = null;
  byId("heatmap").replaceChildren(
    ...weeks.map((week) => {
      const column = element("div", "column");
      // The month is written above the first week that starts in it
      const month = dateOf(week[0].day).getMonth();
      column.append(
        element("span", "month-label", month === lastMonth ? "" : monthName.format(dateOf(week[0].day))),
      );
      lastMonth = month;
      for (const cell of week) {
        const square = element("span", cell ? `cell level-${cell.level}` : "cell empty");
        if (cell) {
          square.title = `${cell.day}: ${formatClock(cell.seconds)}`;
        }
        column.append(square);
      }
      return column;
    }),
  );
}

function renderWeek(days) {
  const longest = Math.max(...days.map(({ seconds }) => seconds), 1);
  byId("weekBars").replaceChildren(
    ...days.map(({ day, seconds }, index) => {
      const column = element("div", "day");
      const area = element("div", "bar-area");
      const bar = element("div", seconds > 0 ? "bar has-time" : "bar");
      bar.style.height = `${Math.round((seconds / longest) * 100)}%`;
      area.append(bar);
      const name = index === days.length - 1 ? "Today" : weekdayName.format(dateOf(day));
      column.append(area, element("span", "value", formatClock(seconds)), element("span", "name", name));
      return column;
    }),
  );
}

function renderMonths(months) {
  const longest = Math.max(...months.map(({ seconds }) => seconds), 1);
  byId("months").replaceChildren(
    ...months.map(({ month, seconds }) => {
      const row = element("div", "month");
      const track = element("div", "track");
      const fill = element("div", "fill");
      fill.style.width = `${Math.round((seconds / longest) * 100)}%`;
      track.append(fill);
      row.append(
        element("span", "", monthName.format(dateOf(`${month}-01`))),
        track,
        element("span", "amount", formatClock(seconds)),
      );
      return row;
    }),
  );
}

function render(saved) {
  const data = dashboardData(migrate(saved), new Date());
  for (const [id, value] of Object.entries(data.cards)) {
    byId(id).textContent = value;
  }
  renderHeatmap(data.heatmap);
  renderWeek(data.week);
  renderMonths(data.months);
}

setUpTheme(byId("theme"));
const { log } = await chrome.storage.local.get("log");
render(log);

// The dashboard can stay open while a video plays
chrome.storage.onChanged.addListener((changes) => changes.log && render(changes.log.newValue));
