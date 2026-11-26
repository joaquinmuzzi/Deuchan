import { goalMinutesOf } from "../src/goal.js";
import { migrate, shownLog, totalSeconds } from "../src/log.js";
import { readManual } from "../src/manual.js";
import { hasOthers, withOtherDevices } from "../src/mosaik-days.js";
import { RATING_DONE_KEY, ratingUrl, shouldAskForRating } from "../src/rating.js";
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
// Whether the one-time request for a rating was answered (either way)
let ratingDone = false;

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
  renderRating();
}

// The request for a rating counts what this computer counted, corrections included, not what Mosaik says of the
// others: the hours someone spent with this copy of Inputly
function renderRating() {
  const total = totalSeconds(shownLog(migrate(log)));
  const show = shouldAskForRating({ totalSeconds: total, done: ratingDone, userAgent: navigator.userAgent });
  byId("rating").hidden = !show;
  if (show) {
    byId("ratingHours").textContent = `${Math.floor(total / 3600)} hours counted.`;
  }
}

// Either answer ends the request for good; the answer is saved before the store opens, as the popup closes then
async function answerRating(rate) {
  ratingDone = true;
  byId("rating").hidden = true;
  await chrome.storage.local.set({ [RATING_DONE_KEY]: true });
  const url = ratingUrl(navigator.userAgent);
  if (rate && url) {
    chrome.tabs.create({ url });
    window.close();
  }
}

byId("ratingRate").addEventListener("click", () => answerRating(true));
byId("ratingLater").addEventListener("click", () => answerRating(false));

// Why reading could not start, kept for a few seconds: the popup redraws this line every second
let manualNotice = null;
const MANUAL_NOTICE_MS = 5000;

function renderManual() {
  const { running, label, text } = describeManual(manualSession, Date.now() / 1000);
  const notice = !running && manualNotice && Date.now() < manualNotice.until ? manualNotice.text : null;
  byId("manual").dataset.running = String(running);
  byId("manualButton").textContent = label;
  byId("manualText").textContent = notice ?? text;
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
    manualNotice = {
      text: "This page cannot be counted: open the page you read on",
      until: Date.now() + MANUAL_NOTICE_MS,
    };
    renderManual();
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
  const { kind, text, action, title } = describeStatus(reply, sound, language);
  byId("status").dataset.kind = kind;
  byId("statusText").textContent = text;
  byId("statusTitle").hidden = !title;
  byId("statusTitle").textContent = title ?? "";
  byId("statusTitle").title = title ?? "";
  const button = byId("override");
  button.hidden = !action;
  if (action) {
    button.textContent = action.label;
    button.dataset.inTarget = String(action.inTarget);
  }
}

// Corrects the guess about the language of the video in the tab, and remembers it for that video
byId("override").addEventListener("click", async (event) => {
  // Read before any await: once the click has been dispatched, event.currentTarget is null
  const inTarget = event.currentTarget.dataset.inTarget === "true";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.tabs.sendMessage(tab.id, { type: "setInTarget", inTarget }).catch(() => {});
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
  RATING_DONE_KEY,
]);
log = stored.log;
mosaikDays = stored.mosaikDays;
mosaikOn = stored.mosaikSettings?.enabled === true;
manualSession = readManual(stored.manualSession);
goalMinutes = goalMinutesOf(stored.goalMinutes);
language = targetName(stored[TARGET_KEY]);
ratingDone = stored[RATING_DONE_KEY] === true;
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
  if (changes[RATING_DONE_KEY]) {
    ratingDone = changes[RATING_DONE_KEY].newValue === true;
  }
  render();
});
setInterval(() => {
  renderStatus();
  renderManual();
}, 1000);
