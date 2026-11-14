// The only place that writes the log, so that several YouTube tabs cannot overwrite each other:
// every update waits for the one before it. It also counts the time two tabs played at once only
// once (see coverage.js), and paints the toolbar icon of each tab. When the person turns on sending to
// Mosaik, it also keeps what it counts in the queue of Mosaik, in the same write (see mosaik-runner.js).
import { addCoverage, isValidInterval } from "./coverage.js";
import { IDLE_COLOR, drawIcons, iconColor } from "./icon.js";
import { correctDay, dayTotal, isDayKey } from "./corrections.js";
import { addSeconds, dayKey, migrate } from "./log.js";
import { createMosaikRunner, queueRemoval, queueWatched } from "./mosaik-runner.js";
import { isVideoId, withOverride } from "./overrides.js";
import { SYNC_URL } from "./sync-config.js";
import { createSyncRunner } from "./sync-runner.js";
import { addVideoSeconds, cleanVideo, removeVideo } from "./videos.js";

let queue = Promise.resolve();

const sync = createSyncRunner({ storage: chrome.storage.local, alarms: chrome.alarms, baseUrl: SYNC_URL });

/** Runs `task` after what was asked before it, as the log has a single writer. */
function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

// The queue of Mosaik is written here too, so the runner changes it only through the same single writer
const mosaik = createMosaikRunner({
  storage: chrome.storage.local,
  alarms: chrome.alarms,
  permissions: chrome.permissions,
  exclusive: enqueue,
});

async function save(intervals, video) {
  const stored = await chrome.storage.local.get([
    "log",
    "covered",
    "videos",
    "mosaikSettings",
    "mosaikOutbox",
  ]);
  let log = migrate(stored.log);
  let videos = stored.videos ?? {};
  let covered = Array.isArray(stored.covered) ? stored.covered : [];
  const now = Date.now() / 1000;
  const counted = [];

  for (const interval of intervals.filter((interval) => isValidInterval(interval, now))) {
    const result = addCoverage(covered, interval);
    covered = result.covered;
    // The day is the one in which the interval ended
    const day = dayKey(new Date(interval.to * 1000));
    log = addSeconds(log, day, result.newSeconds);
    videos = addVideoSeconds(videos, day, video, result.newSeconds);
    counted.push({ interval, newSeconds: result.newSeconds });
  }
  // Only while sending to Mosaik is on: off, nothing more is kept than before
  const mosaikOutbox = queueWatched(stored, counted, video, () => crypto.randomUUID());
  await chrome.storage.local.set({ log, covered, videos, ...(mosaikOutbox ? { mosaikOutbox } : {}) });
  // The time of this computer changed: share it a little later, once
  await sync.soon().catch(() => {});
}

async function saveOverride(videoId, german) {
  const { overrides } = await chrome.storage.local.get("overrides");
  await chrome.storage.local.set({ overrides: withOverride(overrides, videoId, german) });
}

/** The day of the dashboard is corrected: it shows what the person says it was. */
async function correct(day, seconds) {
  const stored = await chrome.storage.local.get(["log", "others"]);
  const log = correctDay(migrate(stored.log), stored.others, day, seconds, Date.now());
  await chrome.storage.local.set({ log });
  await sync.soon().catch(() => {});
}

/** A video of a day was not German: the day loses its time, and it will not count again. */
async function removeFromDay(day, videoId) {
  const stored = await chrome.storage.local.get([
    "log",
    "others",
    "videos",
    "mosaikSettings",
    "mosaikOutbox",
  ]);
  const seconds = stored.videos?.[day]?.[videoId]?.seconds ?? 0;
  const total = dayTotal(migrate(stored.log), stored.others, day);
  // Mosaik is told too; the new total of the day goes with its next sending, as every changed day does
  const mosaikOutbox = queueRemoval(stored, day, videoId, Date.now());
  await chrome.storage.local.set({
    videos: removeVideo(stored.videos, day, videoId),
    ...(mosaikOutbox ? { mosaikOutbox } : {}),
  });
  await saveOverride(videoId, false);
  await correct(day, Math.max(0, Math.round(total - seconds)));
}

// The alarms that start the sync and the sending to Mosaik are kept by the browser, but this makes sure
// they are there (and that there is none for Mosaik while it is off)
sync.schedule().catch(() => {});
mosaik.schedule().catch(() => {});
chrome.alarms.onAlarm.addListener(({ name }) => {
  sync.onAlarm(name).catch(() => {});
  mosaik.onAlarm(name).catch(() => {});
});

// What the panels of the dashboard can ask for. Only the pages of the extension itself: a message from a
// content script (which runs in YouTube) is not one of them.
const CONTROLS = {
  "sync:create": () => sync.create(),
  "sync:join": (message) => sync.join(message.key),
  "sync:now": () => sync.run({ manual: true }),
  "sync:disable": () => sync.disable().then(() => ({})),
  "sync:erase": () => sync.erase(),
  "day:correct": (message) =>
    isDayKey(message.day) && Number.isFinite(message.seconds)
      ? enqueue(() => correct(message.day, message.seconds)).then(() => ({}))
      : Promise.resolve({ error: "invalid" }),
  "day:remove-video": (message) =>
    isDayKey(message.day) && isVideoId(message.videoId)
      ? enqueue(() => removeFromDay(message.day, message.videoId)).then(() => ({}))
      : Promise.resolve({ error: "invalid" }),
  "mosaik:enable": (message) => mosaik.enable(message.url),
  "mosaik:disable": () => mosaik.disable(),
  "mosaik:test": (message) => mosaik.test(message.url),
  "mosaik:backfill": () => mosaik.backfill(),
  "mosaik:send-now": () => mosaik.flush(),
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
    const video = cleanVideo(message.video);
    queue = queue.then(() => save(message.intervals, video)).catch(() => {});
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
