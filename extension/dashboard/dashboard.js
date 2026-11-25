import { backupFileName, buildBackup, mergeBackup, parseBackup, replacePlan } from "../src/backup.js";
import { parseDayMinutes } from "../src/corrections.js";
import { goalMinutesOf, goalSeconds, parseGoalMinutes } from "../src/goal.js";
import { IMMERSION_PERMISSIONS, immersionOf } from "../src/immersion.js";
import { itemUrl } from "../src/items.js";
import { formatClock, migrate, shownLog } from "../src/log.js";
import { dayItems, hasOthers, withOtherDevices } from "../src/mosaik-days.js";
import { SITES_KEY, STREAMING_SITES, enabledSites, sitePermissions } from "../src/sites.js";
import { DEFAULT_RANGE, RANGES, dashboardData, timeline } from "../src/stats.js";
import { TARGET_HASH, TARGET_KEY, targetName, targetOf, targetOptions } from "../src/target.js";
import { setUpTheme } from "../src/theme.js";
import { dayVideos } from "../src/videos.js";
import { setUpMosaikPanel } from "./mosaik-panel.js";

const byId = (id) => document.getElementById(id);
const monthName = new Intl.DateTimeFormat("en", { month: "short" });
const dayName = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const longDayName = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let log;
let mosaikDays;
let mosaikOn = false;
let goalMinutes;
let target;
let videos;
// The day that is open in the detail dialog, if any
let openDay = null;

// What is shown: the time of this computer, live, plus what Mosaik says of the others, and an empty
// log until something has been saved (the storage has nothing at all on a new install)
const current = () => withOtherDevices(shownLog(migrate(log)), mosaikDays);
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
  const scope = byId("scope");
  scope.hidden = !mosaikOn;
  scope.textContent = hasOthers(mosaikDays)
    ? "The time of all your computers, with Mosaik."
    : "The time of this computer only: Mosaik has not answered yet.";
  if (dayDialog.open) {
    renderDetail();
  }
}

const dayDialog = byId("dayDialog");
const dayInput = byId("dayInput");
const dayError = byId("dayError");
// Whether the person typed minutes: until then the field follows the day, which a "Not <language>" changes
let dayInputEdited = false;

/** The minutes of a day as the field shows them before anything is typed. */
const shownMinutes = (day) => String(Math.round((current().days[day] ?? 0) / 60));

function renderDetail() {
  const total = current().days[openDay] ?? 0;
  byId("dayTitle").textContent = longDayName.format(dateOf(openDay));
  byId("dayTotal").textContent = formatClock(total);
  if (!dayInputEdited) {
    dayInput.value = shownMinutes(openDay);
  }
  const list = dayItems(dayVideos(videos, openDay), mosaikDays, openDay);
  byId("dayVideos").replaceChildren(
    ...list.map((video) => {
      const row = element("li", "");
      const name = `${video.kind === "reading" ? "Reading · " : ""}${video.title || video.url || video.id}`;
      const url = itemUrl(video.id, video.url);
      const link = element(url ? "a" : "span", "", name);
      if (url) {
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      link.title = name;
      row.append(link);
      if (video.elsewhere.length > 0) {
        row.append(element("span", "where", video.here ? "+ other computers" : video.elsewhere.join(", ")));
      }
      row.append(element("span", "time", formatClock(video.seconds)));
      // Only what this computer counted can be taken out here
      if (video.here) {
        const button = element("button", "button small", `Not ${targetName(target)}`);
        button.type = "button";
        button.addEventListener("click", () => {
          button.disabled = true;
          chrome.runtime.sendMessage({ type: "day:remove-video", day: openDay, videoId: video.id });
        });
        row.append(button);
      }
      return row;
    }),
  );
  byId("dayNote").textContent =
    list.length > 0
      ? `Not ${targetName(target)} takes that video out of the day and stops counting it. What another computer counted is taken out there.`
      : "No videos are saved for this day. Time from before this version is not listed.";
}

function openDetail(day) {
  openDay = day;
  dayInputEdited = false;
  dayInput.value = shownMinutes(day);
  dayError.textContent = "";
  renderDetail();
  dayDialog.showModal();
  dayInput.select();
}

byId("dayCancel").addEventListener("click", () => dayDialog.close());
dayInput.addEventListener("input", () => {
  dayInputEdited = true;
  dayError.textContent = "";
});
byId("dayForm").addEventListener("submit", (event) => {
  // Saved as it was shown, the day is left as it is counted: a correction would freeze it
  if (!dayInputEdited) {
    return;
  }
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
const targetSelect = byId("targetSelect");

/** The picker, on the saved language (kept in the list even if it is not one of the offered ones). */
function renderTargets() {
  targetSelect.replaceChildren(...targetOptions(target).map(({ code, name }) => new Option(name, code)));
  targetSelect.value = target;
}

/** The immersion note names the language picked, even before it is saved. */
const renderImmersionLanguage = () => {
  byId("immersionLanguage").textContent = targetName(targetSelect.value);
  byId("streamingLanguage").textContent = targetName(targetSelect.value);
};
targetSelect.addEventListener("change", renderImmersionLanguage);

function openSettings(focus) {
  renderTargets();
  renderImmersionLanguage();
  input.value = String(goalMinutes);
  error.textContent = "";
  dialog.showModal();
  if (focus === targetSelect) {
    targetSelect.focus();
  } else {
    input.select();
  }
}

byId("settings").addEventListener("click", () => openSettings(input));
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
  chrome.storage.local.set({ goalMinutes: minutes, [TARGET_KEY]: targetOf(targetSelect.value) });
});

// Export and import: the history moves between browsers as a file (see backup.js)
const backupError = byId("backupError");
const importDialog = byId("importDialog");
const importFile = byId("importFile");
let pendingImport = null;

byId("exportData").addEventListener("click", async () => {
  backupError.textContent = "";
  const backup = buildBackup(await chrome.storage.local.get(null), {
    version: chrome.runtime.getManifest().version,
  });
  // A Blob link downloads without the downloads permission, in Chrome and Firefox alike
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: backupFileName(new Date()),
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

byId("importData").addEventListener("click", () => {
  backupError.textContent = "";
  importFile.value = "";
  importFile.click();
});

importFile.addEventListener("change", async () => {
  const [file] = importFile.files;
  if (!file) {
    return;
  }
  const result = parseBackup(await file.text());
  if (!result.ok) {
    backupError.textContent = result.error;
    return;
  }
  pendingImport = result.data;
  const { days, first, last, seconds } = result.summary;
  byId("importSummary").textContent =
    days === 0
      ? "This backup has no counted days."
      : `This backup has ${days} ${days === 1 ? "day" : "days"}, from ${first} to ${last}, ` +
        `${formatClock(seconds)} in all.`;
  byId("importError").textContent = "";
  importDialog.showModal();
});

async function applyImport(merge) {
  if (!pendingImport) {
    return;
  }
  try {
    const current = await chrome.storage.local.get(null);
    const { set, remove } = merge ? mergeBackup(current, pendingImport) : replacePlan(current, pendingImport);
    await chrome.storage.local.set(set);
    if (remove.length > 0) {
      await chrome.storage.local.remove(remove);
    }
    pendingImport = null;
    importDialog.close();
    dialog.close();
    // Every part of the page reads the new data at once
    location.reload();
  } catch (failure) {
    byId("importError").textContent = `Could not import: ${failure.message}`;
  }
}

byId("importMerge").addEventListener("click", () => applyImport(true));
byId("importReplace").addEventListener("click", () => applyImport(false));
byId("importCancel").addEventListener("click", () => {
  pendingImport = null;
  importDialog.close();
});

// The immersion profile: every video of this Chrome profile counts, on any site
const immersionBox = byId("immersionEnabled");
const immersionError = byId("immersionError");
immersionBox.addEventListener("change", () => {
  immersionError.textContent = "";
  if (!immersionBox.checked) {
    chrome.storage.local.set({ immersion: { enabled: false } });
    return;
  }
  // Asked for from the click itself, as Chrome wants
  chrome.permissions
    .request(IMMERSION_PERMISSIONS)
    .catch(() => false)
    .then(async (granted) => {
      if (!granted) {
        immersionBox.checked = false;
        immersionError.textContent = "Without access to the sites, Inputly cannot find their videos.";
        return;
      }
      await chrome.storage.local.set({ immersion: { enabled: true } });
      await chrome.runtime.sendMessage({ type: "immersion:refresh" }).catch(() => {});
    });
});

// The streaming sites: each one asks for access to its own pages, from the click that turns it on
const streamingError = byId("streamingError");
const siteBoxes = new Map(
  STREAMING_SITES.map((site) => {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = `site-${site.id}`;
    const label = document.createElement("label");
    label.className = "switch-row";
    label.append(box, ` ${site.name}${site.experimental ? " (experimental)" : ""}`);
    byId("streamingSites").append(label);
    box.addEventListener("change", () => setSite(site, box));
    return [site.id, box];
  }),
);

/** Turns a site on (if the person grants its access) or off, and keeps what the boxes say. */
async function setSite(site, box) {
  streamingError.textContent = "";
  const want = box.checked;
  // Asked for first, from the click itself, as the browser wants
  const granted = want ? await chrome.permissions.request(sitePermissions(site)).catch(() => false) : true;
  if (!granted) {
    box.checked = false;
    streamingError.textContent = `Without access to ${site.name}, Inputly cannot see what its player plays.`;
    return;
  }
  const saved = (await chrome.storage.local.get(SITES_KEY))[SITES_KEY];
  await chrome.storage.local.set({ [SITES_KEY]: { ...saved, [site.id]: want } });
  await chrome.runtime.sendMessage({ type: "streaming:refresh" }).catch(() => {});
}

const renderSites = (saved) => {
  const on = enabledSites(saved);
  for (const [id, box] of siteBoxes) {
    box.checked = on.includes(id);
  }
};

byId("ranges").addEventListener("change", (event) => {
  range = Number(event.target.value);
  chrome.storage.local.set({ range });
  renderChart();
});

setUpTheme(byId("theme"));
setUpMosaikPanel();
const stored = await chrome.storage.local.get([
  "log",
  "mosaikDays",
  "mosaikSettings",
  "goalMinutes",
  "range",
  "videos",
  "immersion",
  SITES_KEY,
  TARGET_KEY,
]);
log = stored.log;
mosaikDays = stored.mosaikDays;
mosaikOn = stored.mosaikSettings?.enabled === true;
videos = stored.videos;
immersionBox.checked = immersionOf(stored.immersion);
renderSites(stored[SITES_KEY]);
goalMinutes = goalMinutesOf(stored.goalMinutes);
target = targetOf(stored[TARGET_KEY]);
renderTargets();
renderImmersionLanguage();
range = RANGES.some(({ days }) => days === stored.range) ? stored.range : DEFAULT_RANGE;
renderRanges();
render();
// A new install opens the dashboard here, to ask for the language (see background.js)
if (location.hash === TARGET_HASH) {
  history.replaceState(null, "", location.pathname);
  openSettings(targetSelect);
}
// The time of the other computers as Mosaik has it now
chrome.runtime.sendMessage({ type: "mosaik:refresh-days", force: true }).catch(() => {});

// The dashboard can stay open while a video plays or the goal changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.log) {
    log = changes.log.newValue;
  }
  if (changes.mosaikDays) {
    mosaikDays = changes.mosaikDays.newValue;
  }
  if (changes.mosaikSettings) {
    mosaikOn = changes.mosaikSettings.newValue?.enabled === true;
  }
  if (changes.immersion) {
    immersionBox.checked = immersionOf(changes.immersion.newValue);
  }
  if (changes[SITES_KEY]) {
    renderSites(changes[SITES_KEY].newValue);
  }
  if (changes.videos) {
    videos = changes.videos.newValue;
  }
  if (changes.goalMinutes) {
    goalMinutes = goalMinutesOf(changes.goalMinutes.newValue);
  }
  if (changes[TARGET_KEY]) {
    target = targetOf(changes[TARGET_KEY].newValue);
    if (!dialog.open) {
      renderTargets();
      renderImmersionLanguage();
    }
  }
  render();
});
