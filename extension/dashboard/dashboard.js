import { parseDayMinutes } from "../src/corrections.js";
import { goalMinutesOf, goalSeconds, parseGoalMinutes } from "../src/goal.js";
import { formatClock, migrate } from "../src/log.js";
import { DEFAULT_RANGE, RANGES, dashboardData, timeline } from "../src/stats.js";
import { effectiveLog, sanitizeDevices } from "../src/sync-data.js";
import { setUpTheme } from "../src/theme.js";
import { dayVideos } from "../src/videos.js";
import { setUpSyncPanel } from "./sync-panel.js";

const byId = (id) => document.getElementById(id);
const monthName = new Intl.DateTimeFormat("en", { month: "short" });
const dayName = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const longDayName = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let log;
let others;
let goalMinutes;
let videos;
// The day that is open in the detail dialog, if any
let openDay = null;

// What is shown: the time of this computer plus the time of the others, and an empty log until
// something has been saved (the storage has nothing at all on a new install)
const current = () => effectiveLog(migrate(log), others);
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

function renderHeatmap(months) {
  byId("heatmap").replaceChildren(
    ...months.map(({ month, weeks }) => {
      const block = element("div", "month");
      // A month is as wide as its weeks, so that every square has the same size
      block.style.flex = `${weeks.length} 1 0`;
      const grid = element("div", "weeks");
      grid.style.setProperty("--weeks", String(weeks.length));
      for (const week of weeks) {
        const column = element("div", "column");
        for (const cell of week) {
          const square = element("span", cell ? `cell level-${cell.level}` : "cell empty");
          if (cell) {
            square.title = `${cell.day}: ${formatClock(cell.seconds)}`;
            makeOpenable(square, cell.day);
          }
          column.append(square);
        }
        grid.append(column);
      }
      block.append(grid, element("span", "month-name", monthName.format(dateOf(`${month}-01`))));
      return block;
    }),
  );
}

/** A square or a bar that opens the detail of its day when it is clicked, or with the keyboard. */
function makeOpenable(node, day) {
  node.dataset.day = day;
  node.tabIndex = 0;
  node.setAttribute("role", "button");
  node.addEventListener("click", () => openDetail(day));
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(day);
    }
  });
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
  const bars = timeline(current(), new Date(), range);
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
      // A bar of several days has no single day to open
      if (bar.from === bar.to) {
        makeOpenable(node, bar.from);
      }
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
  const data = dashboardData(current(), new Date());
  for (const [id, value] of Object.entries(data.cards)) {
    byId(id).textContent = value;
  }
  renderHeatmap(data.heatmap);
  renderChart();
  renderWeekdays(data.weekdays);
  if (dayDialog.open) {
    renderDetail();
  }
}

const dayDialog = byId("dayDialog");
const dayInput = byId("dayInput");
const dayError = byId("dayError");

function renderDetail() {
  const total = current().days[openDay] ?? 0;
  byId("dayTitle").textContent = longDayName.format(dateOf(openDay));
  byId("dayTotal").textContent = formatClock(total);
  const list = dayVideos(videos, openDay, sanitizeDevices(others));
  byId("dayVideos").replaceChildren(
    ...list.map((video) => {
      const row = element("li", "");
      const link = element("a", "", video.title || video.id);
      link.href = `https://www.youtube.com/watch?v=${video.id}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = video.title || video.id;
      const button = element("button", "button small", "Not German");
      button.type = "button";
      button.addEventListener("click", () => {
        button.disabled = true;
        chrome.runtime.sendMessage({ type: "day:remove-video", day: openDay, videoId: video.id });
      });
      row.append(link, element("span", "time", formatClock(video.seconds)), button);
      return row;
    }),
  );
  byId("dayNote").textContent =
    list.length > 0
      ? "Not German takes that video out of the day, on all your computers, and stops counting it here."
      : "No videos are saved for this day. Videos are listed from the version that added this list, and only the last two weeks of the other computers.";
}

function openDetail(day) {
  openDay = day;
  dayInput.value = String(Math.round((current().days[day] ?? 0) / 60));
  dayError.textContent = "";
  renderDetail();
  dayDialog.showModal();
  dayInput.select();
}

byId("dayCancel").addEventListener("click", () => dayDialog.close());
dayInput.addEventListener("input", () => {
  dayError.textContent = "";
});
byId("dayForm").addEventListener("submit", (event) => {
  const minutes = parseDayMinutes(dayInput.value);
  if (minutes === null) {
    event.preventDefault();
    dayError.textContent = "Enter a whole number of minutes, from 0 to 1440";
    return;
  }
  chrome.runtime.sendMessage({ type: "day:correct", day: openDay, seconds: minutes * 60 });
});
dayDialog.addEventListener("close", () => {
  openDay = null;
});

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
setUpSyncPanel();
const stored = await chrome.storage.local.get(["log", "others", "goalMinutes", "range", "videos"]);
log = stored.log;
others = stored.others;
videos = stored.videos;
goalMinutes = goalMinutesOf(stored.goalMinutes);
range = RANGES.some(({ days }) => days === stored.range) ? stored.range : DEFAULT_RANGE;
renderRanges();
render();

// The dashboard can stay open while a video plays or the goal changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.log) {
    log = changes.log.newValue;
  }
  if (changes.others) {
    others = changes.others.newValue;
  }
  if (changes.videos) {
    videos = changes.videos.newValue;
  }
  if (changes.goalMinutes) {
    goalMinutes = goalMinutesOf(changes.goalMinutes.newValue);
  }
  render();
});
