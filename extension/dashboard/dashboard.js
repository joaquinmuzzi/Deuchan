import { goalMinutesOf, goalSeconds, parseGoalMinutes } from "../src/goal.js";
import { formatClock, migrate } from "../src/log.js";
import { DEFAULT_RANGE, RANGES, dashboardData, timeline } from "../src/stats.js";
import { setUpTheme } from "../src/theme.js";

const byId = (id) => document.getElementById(id);
const monthName = new Intl.DateTimeFormat("en", { month: "short" });
const dayName = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let log;
let goalMinutes;
let range = DEFAULT_RANGE;

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
      const start = dateOf(week[0].day);
      column.append(
        element("span", "month-label", start.getMonth() === lastMonth ? "" : monthName.format(start)),
      );
      lastMonth = start.getMonth();
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

function renderRanges() {
  byId("ranges").replaceChildren(
    ...RANGES.map(({ days, label }) => {
      const wrapper = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "range";
      radio.value = String(days);
      radio.checked = days === range;
      wrapper.append(radio, label);
      return wrapper;
    }),
  );
}

function renderChart() {
  const bars = timeline(log, new Date(), range);
  const goal = goalSeconds(goalMinutes);
  // The goal stays inside the chart even if no day came close to it, and the tallest bar has room
  const scale = Math.max(...bars.map((bar) => bar.perDay), goal) * 1.15;
  const chart = byId("chart");
  chart.style.setProperty("--bar-gap", bars.length > 30 ? "1px" : "2px");
  const line = element("div", "goal-line");
  line.style.bottom = `${(goal / scale) * 100}%`;
  line.title = `Daily goal: ${formatClock(goal)}`;
  chart.replaceChildren(
    line,
    ...bars.map((bar) => {
      const node = element("div", bar.seconds === 0 ? "bar empty" : bar.perDay >= goal ? "bar hit" : "bar");
      node.style.height = `${(bar.perDay / scale) * 100}%`;
      const days = bar.from === bar.to ? bar.from : `${bar.from} to ${bar.to}`;
      node.title = `${days}: ${formatClock(bar.seconds)}`;
      return node;
    }),
  );
  byId("axisStart").textContent = dayName.format(dateOf(bars[0].from));
}

function renderWeekdays(averages) {
  const longest = Math.max(...averages, 1);
  byId("weekdays").replaceChildren(
    ...averages.map((seconds, index) => {
      const row = element("div", "weekday");
      const track = element("div", "track");
      const fill = element("div", "fill");
      fill.style.width = `${(seconds / longest) * 100}%`;
      track.append(fill);
      row.append(
        element("span", "", WEEKDAYS[index]),
        track,
        element("span", "amount", formatClock(seconds)),
      );
      return row;
    }),
  );
}

function render() {
  const data = dashboardData(migrate(log), new Date());
  for (const [id, value] of Object.entries(data.cards)) {
    byId(id).textContent = value;
  }
  renderHeatmap(data.heatmap);
  renderChart();
  renderWeekdays(data.weekdays);
}

const dialog = byId("goalDialog");
const input = byId("goalInput");
const error = byId("goalError");

byId("settings").addEventListener("click", () => {
  input.value = String(goalMinutes);
  error.textContent = "";
  dialog.showModal();
  input.select();
});
byId("goalCancel").addEventListener("click", () => dialog.close());
input.addEventListener("input", () => {
  error.textContent = "";
});
byId("goalForm").addEventListener("submit", (event) => {
  const minutes = parseGoalMinutes(input.value);
  if (minutes === null) {
    // Stays open, with what was typed, until it is a whole number of minutes in range
    event.preventDefault();
    error.textContent = "Enter a whole number of minutes, from 1 to 600";
    return;
  }
  chrome.storage.local.set({ goalMinutes: minutes });
});

byId("ranges").addEventListener("change", (event) => {
  range = Number(event.target.value);
  chrome.storage.local.set({ range });
  renderChart();
});

setUpTheme(byId("theme"));
const stored = await chrome.storage.local.get(["log", "goalMinutes", "range"]);
log = stored.log;
goalMinutes = goalMinutesOf(stored.goalMinutes);
range = RANGES.some(({ days }) => days === stored.range) ? stored.range : DEFAULT_RANGE;
renderRanges();
render();

// The dashboard can stay open while a video plays or the goal changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.log) {
    log = changes.log.newValue;
  }
  if (changes.goalMinutes) {
    goalMinutes = goalMinutesOf(changes.goalMinutes.newValue);
  }
  render();
});
