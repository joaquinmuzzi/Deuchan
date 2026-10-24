// The only place that writes the log, so that several YouTube tabs cannot overwrite each other:
// every update waits for the one before it. It also counts the time two tabs played at once only
// once (see coverage.js), and paints the toolbar icon of each tab.
import { addCoverage, isValidInterval } from "./coverage.js";
import { IDLE_COLOR, drawIcons, iconColor } from "./icon.js";
import { addSeconds, dayKey, migrate } from "./log.js";

let queue = Promise.resolve();

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
}

// The icon of every tab starts grey; a tab with a German video paints its own in orange
chrome.action.setIcon({ imageData: drawIcons(IDLE_COLOR) });

chrome.runtime.onMessage.addListener((message, sender) => {
  // Only the content script of this extension, in a YouTube tab, can speak to us
  if (sender.id !== chrome.runtime.id) {
    return;
  }
  if (message?.type === "watched" && Array.isArray(message.intervals)) {
    queue = queue.then(() => save(message.intervals)).catch(() => {});
  } else if (message?.type === "language" && sender.tab?.id !== undefined) {
    chrome.action.setIcon({ tabId: sender.tab.id, imageData: drawIcons(iconColor(message.german)) });
  }
});
