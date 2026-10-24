import { goalMinutesOf } from "../src/goal.js";
import { migrate } from "../src/log.js";
import { describeStatus } from "../src/status.js";
import { summarize } from "../src/summary.js";
import { setUpTheme } from "../src/theme.js";

const byId = (id) => document.getElementById(id);

let log;
let goalMinutes;

function render() {
  const summary = summarize(migrate(log), new Date(), goalMinutes);
  byId("today").textContent = summary.today;
  byId("today").dataset.met = String(summary.goalMet);
  byId("goal").textContent = summary.goal;
  byId("week").textContent = summary.week;
  byId("month").textContent = summary.month;
  byId("streak").textContent = String(summary.streak);
}

async function renderStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Pages without the content script do not answer, and sendMessage then fails
  const reply = tab
    ? await chrome.tabs.sendMessage(tab.id, { type: "status" }).catch(() => undefined)
    : undefined;
  const { kind, text } = describeStatus(reply);
  byId("status").textContent = text;
  byId("status").dataset.kind = kind;
}

byId("dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  window.close();
});

setUpTheme(byId("theme"));
const stored = await chrome.storage.local.get(["log", "goalMinutes"]);
log = stored.log;
goalMinutes = goalMinutesOf(stored.goalMinutes);
render();
renderStatus();

// The popup can stay open while a video plays or the goal changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.log) {
    log = changes.log.newValue;
  }
  if (changes.goalMinutes) {
    goalMinutes = goalMinutesOf(changes.goalMinutes.newValue);
  }
  render();
});
setInterval(renderStatus, 1000);
