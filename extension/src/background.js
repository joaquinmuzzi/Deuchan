// The only place that writes the log, so that several YouTube tabs cannot overwrite each other:
// every update waits for the one before it. It also counts the time two tabs played at once only
// once (see coverage.js), and paints the toolbar icon of each tab.
import { addCoverage, isValidInterval } from "./coverage.js";
import { IDLE_COLOR, drawIcons, iconColor } from "./icon.js";
import { addSeconds, dayKey, migrate } from "./log.js";
import { isVideoId, withOverride } from "./overrides.js";
import { SYNC_URL } from "./sync-config.js";
import { createSyncRunner } from "./sync-runner.js";

let queue = Promise.resolve();

const sync = createSyncRunner({ storage: chrome.storage.local, alarms: chrome.alarms, baseUrl: SYNC_URL });

async function save(intervals) {
  const stored = await chrome.storage.local.get(["log", "covered"]);
  let log = migrate(stored.log);
  let covered = Array.isArray(stored.covered) ? stored.covered : [];
  const now = Date.now() / 1000;

  for (const interval of intervals.filter((interval) => isValidInterval(interval, now))) {
    const result = addCoverage(covered, interval);
    covered = result.covered;
    // The day is the one in which the interval ended
    log = addSeconds(log, dayKey(new Date(interval.to * 1000)), result.newSeconds);
  }
  await chrome.storage.local.set({ log, covered });
  // The time of this computer changed: share it a little later, once
  await sync.soon().catch(() => {});
}

async function saveOverride(videoId, german) {
  const { overrides } = await chrome.storage.local.get("overrides");
  await chrome.storage.local.set({ overrides: withOverride(overrides, videoId, german) });
}

// The alarms that start the sync are kept by the browser, but this makes sure they are there
sync.schedule().catch(() => {});
chrome.alarms.onAlarm.addListener(({ name }) => sync.onAlarm(name).catch(() => {}));

// What the sync panel of the dashboard can ask for. Only the pages of the extension itself: a message
// from a content script (which runs in YouTube) is not one of them.
const CONTROLS = {
  "sync:create": () => sync.create(),
  "sync:join": (message) => sync.join(message.key),
  "sync:now": () => sync.run({ manual: true }),
  "sync:disable": () => sync.disable().then(() => ({})),
  "sync:erase": () => sync.erase(),
};

// The icon of every tab starts grey; a tab with a German video paints its own in orange
chrome.action.setIcon({ imageData: drawIcons(IDLE_COLOR) });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension can speak to us: its content script in YouTube, and its own pages
  if (sender.id !== chrome.runtime.id) {
    return;
  }
  const control = Object.hasOwn(CONTROLS, message?.type) ? CONTROLS[message.type] : null;
  if (control) {
    if (sender.url?.startsWith(chrome.runtime.getURL(""))) {
      control(message)
        .then(sendResponse)
        .catch(() => sendResponse({ error: "unknown" }));
      // The answer comes later
      return true;
    }
    return;
  }
  if (message?.type === "watched" && Array.isArray(message.intervals)) {
    queue = queue.then(() => save(message.intervals)).catch(() => {});
  } else if (
    message?.type === "override" &&
    isVideoId(message.videoId) &&
    typeof message.german === "boolean"
  ) {
    queue = queue.then(() => saveOverride(message.videoId, message.german)).catch(() => {});
  } else if (message?.type === "language" && sender.tab?.id !== undefined) {
    chrome.action.setIcon({ tabId: sender.tab.id, imageData: drawIcons(iconColor(message.german)) });
  }
});
