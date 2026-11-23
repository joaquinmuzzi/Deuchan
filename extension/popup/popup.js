import { goalMinutesOf } from "../src/goal.js";
import { migrate, shownLog } from "../src/log.js";
import { readManual } from "../src/manual.js";
import { hasOthers, withOtherDevices } from "../src/mosaik-days.js";
import { describeManual, describeStatus } from "../src/status.js";
import { summarize } from "../src/summary.js";
import { TARGET_KEY, targetName } from "../src/target.js";
import { setUpTheme } from "../src/theme.js";

const byId = (id) => document.getElementById(id);

let log;
let mosaikDays;
let mosaikOn = false;
let manualSession = null;
let goalMinutes;
// The name of the language the person learns, which the status says: "Counting German"
let language;

function render() {
  // This computer, live, and what Mosaik says of the others
  const summary = summarize(withOtherDevices(shownLog(migrate(log)), mosaikDays), new Date(), goalMinutes);
  byId("today").textContent = summary.today;
  byId("goalText").textContent = summary.goalText;
  byId("goalBlock").dataset.met = String(summary.goalMet);
  byId("progress").style.width = `${Math.round(summary.progress * 100)}%`;
  byId("progress").parentElement.setAttribute("aria-valuenow", String(Math.round(summary.progress * 100)));
  byId("streak").textContent = summary.streak;
  byId("dailyAverage").textContent = summary.dailyAverage;
  byId("week").textContent = summary.week;
  // Whether the totals include other computers is said on hover: a line under the cards took room from
  // what matters and, for most people, who do not use Mosaik, said nothing
  byId("stats").title = !mosaikOn
    ? ""
    : hasOthers(mosaikDays)
      ? "All your computers, with Mosaik"
      : "This computer only";
  renderManual();
}

function renderManual() {
  const { running, label, text } = describeManual(manualSession, Date.now() / 1000);
  byId("manual").dataset.running = String(running);
  byId("manualButton").textContent = label;
  byId("manualText").textContent = text;
}

// Reading with no video: counted from now on the page of this tab, until it is stopped
byId("manualButton").addEventListener("click", async () => {
  if (manualSession) {
    await chrome.runtime.sendMessage({ type: "manual:stop" }).catch(() => {});
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = tab
    ? await chrome.runtime.sendMessage({ type: "manual:start", tabId: tab.id }).catch(() => null)
    : null;
  if (!result?.session) {
    byId("manualText").textContent = "This page cannot be counted: open the page you read on";
  }
});

async function renderStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Pages without the content script do not answer, and sendMessage then fails
  const reply = tab
    ? await chrome.tabs.sendMessage(tab.id, { type: "status" }).catch(() => undefined)
    : undefined;
  // A page with no video may still play sound that counts (a podcast, in the immersion profile)
  const sound =
    !reply && tab
      ? (await chrome.runtime.sendMessage({ type: "audio:status", tabId: tab.id }).catch(() => null))?.sound
      : null;
  const { kind, text, action } = describeStatus(reply, sound, language);
  byId("status").dataset.kind = kind;
  byId("statusText").textContent = text;
  const button = byId("override");
  button.hidden = !action;
  if (action) {
    button.textContent = action.label;
    button.dataset.inTarget = String(action.inTarget);
  }
}

// Corrects the guess about the language of the video in the tab, and remembers it for that video
byId("override").addEventListener("click", async (event) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.tabs
      .sendMessage(tab.id, { type: "setInTarget", inTarget: event.currentTarget.dataset.inTarget === "true" })
      .catch(() => {});
  }
  renderStatus();
});

byId("dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  window.close();
});

setUpTheme(byId("theme"));
const stored = await chrome.storage.local.get([
  "log",
  "mosaikDays",
  "mosaikSettings",
  "manualSession",
  "goalMinutes",
  TARGET_KEY,
]);
log = stored.log;
mosaikDays = stored.mosaikDays;
mosaikOn = stored.mosaikSettings?.enabled === true;
manualSession = readManual(stored.manualSession);
goalMinutes = goalMinutesOf(stored.goalMinutes);
language = targetName(stored[TARGET_KEY]);
render();
renderStatus();
// The time of the other computers, if Mosaik has something newer
chrome.runtime.sendMessage({ type: "mosaik:refresh-days" }).catch(() => {});

// The popup can stay open while a video plays or the goal changes
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
  if (changes.manualSession) {
    manualSession = readManual(changes.manualSession.newValue);
  }
  if (changes.goalMinutes) {
    goalMinutes = goalMinutesOf(changes.goalMinutes.newValue);
  }
  if (changes[TARGET_KEY]) {
    language = targetName(changes[TARGET_KEY].newValue);
    renderStatus();
  }
  render();
});
setInterval(() => {
  renderStatus();
  renderManual();
}, 1000);
