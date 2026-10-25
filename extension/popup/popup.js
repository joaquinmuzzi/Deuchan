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
  byId("goalText").textContent = summary.goalText;
  byId("goalBlock").dataset.met = String(summary.goalMet);
  byId("progress").style.width = `${Math.round(summary.progress * 100)}%`;
  byId("progress").parentElement.setAttribute("aria-valuenow", String(Math.round(summary.progress * 100)));
  byId("streak").textContent = summary.streak;
  byId("dailyAverage").textContent = summary.dailyAverage;
  byId("week").textContent = summary.week;
}

async function renderStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Pages without the content script do not answer, and sendMessage then fails
  const reply = tab
    ? await chrome.tabs.sendMessage(tab.id, { type: "status" }).catch(() => undefined)
    : undefined;
  const { kind, text, action } = describeStatus(reply);
  byId("status").dataset.kind = kind;
  byId("statusText").textContent = text;
  const button = byId("override");
  button.hidden = !action;
  if (action) {
    button.textContent = action.label;
    button.dataset.german = String(action.german);
  }
}

// Corrects the guess about the language of the video in the tab, and remembers it for that video
byId("override").addEventListener("click", async (event) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.tabs
      .sendMessage(tab.id, { type: "setGerman", german: event.currentTarget.dataset.german === "true" })
      .catch(() => {});
  }
  renderStatus();
});

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
