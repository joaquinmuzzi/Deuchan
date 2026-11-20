// The only place that writes the log, so that several tabs cannot overwrite each other: every update
// waits for the one before it. It also counts the time two tabs played at once only once (see
// coverage.js), and paints the toolbar icon of each tab. When the person turns on sending to Mosaik, it
// also keeps what it counts in the queue of Mosaik, in the same write (see mosaik-runner.js).
//
// It also keeps the immersion profile going (immersion.js) and the reading counted by hand (manual.js).
import { addCoverage, isValidInterval } from "./coverage.js";
import { correctDay, isDayKey } from "./corrections.js";
import { IDLE_COLOR, drawIcons, iconColor } from "./icon.js";
import { IMMERSION_PERMISSIONS, IMMERSION_SCRIPT_ID, immersionOf, immersionScript } from "./immersion.js";
import { isItemId, webItemId } from "./items.js";
import { LEGACY_ALARMS, LEGACY_KEYS, localizeCorrections } from "./legacy-sync.js";
import { addSeconds, dayKey, migrate, shownLog } from "./log.js";
import { IDLE_SECONDS, MANUAL_ALARM, flushManual, manualItem, readManual, startManual } from "./manual.js";
import { othersOn } from "./mosaik-days.js";
import { createMosaikRunner, queueRemoval, queueWatched } from "./mosaik-runner.js";
import { isVideoId, withOverride } from "./overrides.js";
import { forgetTab, pageTitle, splitByPage, trackPage } from "./pages.js";
import { addVideoSeconds, cleanVideo, removeVideo } from "./videos.js";

let queue = Promise.resolve();

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
}

async function saveOverride(videoId, german) {
  const { overrides } = await chrome.storage.local.get("overrides");
  await chrome.storage.local.set({ overrides: withOverride(overrides, videoId, german) });
}

/**
 * The day of the dashboard is corrected: it shows what the person says it was. The dashboard shows all
 * the computers, and only the time of this one can change.
 */
async function correct(day, seconds) {
  const stored = await chrome.storage.local.get(["log", "mosaikDays"]);
  const log = correctDay(migrate(stored.log), day, seconds, Date.now(), othersOn(stored.mosaikDays, day));
  await chrome.storage.local.set({ log });
}

/** An item of a day was not German: the day loses its time here, and a video will not count again. */
async function removeFromDay(day, id) {
  const stored = await chrome.storage.local.get([
    "log",
    "videos",
    "mosaikDays",
    "mosaikSettings",
    "mosaikOutbox",
  ]);
  const seconds = stored.videos?.[day]?.[id]?.seconds ?? 0;
  const total = (shownLog(migrate(stored.log)).days[day] ?? 0) + othersOn(stored.mosaikDays, day);
  // Mosaik is told too; the new total of the day goes with its next sending, as every changed day does
  const mosaikOutbox = queueRemoval(stored, day, id, Date.now());
  await chrome.storage.local.set({
    videos: removeVideo(stored.videos, day, id),
    ...(mosaikOutbox ? { mosaikOutbox } : {}),
  });
  if (isVideoId(id)) {
    await saveOverride(id, false);
  }
  await correct(day, Math.max(0, Math.round(total - seconds)));
}

/** Takes `seconds` back from today, for reading counted while nobody was there. */
async function takeBack(seconds) {
  if (!(seconds > 0)) {
    return;
  }
  const day = dayKey(new Date());
  const stored = await chrome.storage.local.get(["log", "videos", "mosaikDays"]);
  const total = (shownLog(migrate(stored.log)).days[day] ?? 0) + othersOn(stored.mosaikDays, day);
  await correct(day, Math.max(0, Math.round(total - seconds)));
}

// Reading counted by hand

/** The toolbar says that reading is being counted, on every tab. */
const showManual = (on) =>
  Promise.all([
    chrome.action.setBadgeText({ text: on ? "R" : "" }),
    chrome.action.setBadgeBackgroundColor({ color: "#2f9e44" }),
  ]).catch(() => {});

/** Counts what the session has to count now, and keeps what is left of it. In the single writer. */
async function stepManual(what = {}) {
  const session = readManual((await chrome.storage.local.get("manualSession")).manualSession);
  if (!session) {
    return null;
  }
  const result = flushManual(session, Date.now() / 1000, what);
  if (result.interval) {
    await save([result.interval], manualItem(session));
  }
  await takeBack(result.takeBack);
  if (result.session) {
    await chrome.storage.local.set({ manualSession: result.session });
  } else {
    await chrome.storage.local.remove("manualSession");
    await chrome.alarms.clear(MANUAL_ALARM);
    await showManual(false);
  }
  return result.session;
}

async function manualStart(message) {
  // The popup opened on that tab, which lets the extension see its address and title (activeTab)
  const tab = Number.isInteger(message.tabId) ? await chrome.tabs.get(message.tabId).catch(() => null) : null;
  const session = startManual(tab, Date.now() / 1000);
  if (!session || !webItemId(session.url)) {
    return { error: "no-page" };
  }
  await enqueue(async () => {
    await stepManual({ stop: true });
    await chrome.storage.local.set({ manualSession: session });
  });
  await chrome.alarms.create(MANUAL_ALARM, { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  await showManual(true);
  return { session };
}

chrome.idle.setDetectionInterval(IDLE_SECONDS);
chrome.idle.onStateChanged.addListener((state) => {
  if (state !== "active") {
    enqueue(() => stepManual({ idle: true })).catch(() => {});
  }
});
// The pages each tab shows, to name the time of videos on other sites (see pages.js). Chrome only says
// the address and title of the tabs Deuchan can see, which in the immersion profile is every one.
let tabPages = {};
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url !== undefined || change.title !== undefined) {
    tabPages = trackPage(
      tabPages,
      tabId,
      { url: change.url ?? tab.url, title: change.title ?? tab.title },
      Date.now() / 1000,
    );
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  tabPages = forgetTab(tabPages, tabId);
  const session = readManual((await chrome.storage.local.get("manualSession")).manualSession);
  if (session?.tabId === tabId) {
    enqueue(() => stepManual({ stop: true })).catch(() => {});
  }
});

// The immersion profile

/** Makes the script of every site match the setting: there while it is on, and gone while it is off. */
async function scheduleImmersion() {
  if (!chrome.scripting) {
    // The permission was never given, or was taken back: nothing can run on other sites
    return;
  }
  const { immersion } = await chrome.storage.local.get("immersion");
  const on = immersionOf(immersion) && (await chrome.permissions.contains(IMMERSION_PERMISSIONS));
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [IMMERSION_SCRIPT_ID] });
  if (on && registered.length === 0) {
    await chrome.scripting.registerContentScripts([immersionScript()]);
  } else if (!on && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [IMMERSION_SCRIPT_ID] });
  }
}

// The old sync between computers

/** Once, after the update that took the sync away: what it kept goes, and Mosaik gets the history again. */
async function leaveLegacySync() {
  const stored = await chrome.storage.local.get(["log", "others", ...LEGACY_KEYS]);
  if (!LEGACY_KEYS.some((key) => stored[key] !== undefined)) {
    return;
  }
  await enqueue(async () => {
    const log = localizeCorrections(migrate(stored.log), stored.others, Date.now());
    await chrome.storage.local.set({ log });
    await chrome.storage.local.remove(LEGACY_KEYS);
  });
  await Promise.all(LEGACY_ALARMS.map((name) => chrome.alarms.clear(name)));
  // What was sent to Mosaik before had the time of all the computers together: now only this one, now
  // or the next time it is turned on
  await chrome.storage.local.remove("mosaikBackfilledAt");
  await mosaik.backfill().catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  leaveLegacySync().catch(() => {});
});

// The alarms that start the sending to Mosaik are kept by the browser, but this makes sure they are
// there (and that there is none while it is off); the same for the script of the immersion profile
mosaik.schedule().catch(() => {});
scheduleImmersion().catch(() => {});
chrome.storage.local
  .get("manualSession")
  .then(({ manualSession }) => showManual(readManual(manualSession) !== null))
  .catch(() => {});
chrome.alarms.onAlarm.addListener(({ name }) => {
  mosaik.onAlarm(name).catch(() => {});
  if (name === MANUAL_ALARM) {
    // The computer may have slept: if nobody is there, the reading is over
    chrome.idle
      .queryState(IDLE_SECONDS)
      .then((state) => enqueue(() => stepManual({ idle: state !== "active" })).catch(() => {}));
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.immersion) {
    scheduleImmersion().catch(() => {});
  }
});
chrome.permissions.onRemoved.addListener(() => {
  scheduleImmersion().catch(() => {});
});

// What the pages of the extension (the dashboard, the popup) can ask for. Only the pages of the
// extension itself: a message from a content script (which runs in a web page) is not one of them.
const CONTROLS = {
  "day:correct": (message) =>
    isDayKey(message.day) && Number.isFinite(message.seconds)
      ? enqueue(() => correct(message.day, message.seconds)).then(() => ({}))
      : Promise.resolve({ error: "invalid" }),
  "day:remove-video": (message) =>
    isDayKey(message.day) && isItemId(message.videoId)
      ? enqueue(() => removeFromDay(message.day, message.videoId)).then(() => ({}))
      : Promise.resolve({ error: "invalid" }),
  "immersion:refresh": () => scheduleImmersion().then(() => ({})),
  "manual:start": (message) => manualStart(message),
  "manual:stop": () => enqueue(() => stepManual({ stop: true })).then(() => ({})),
  "mosaik:enable": (message) => mosaik.enable(message.url, message.token),
  "mosaik:disable": () => mosaik.disable(),
  "mosaik:test": (message) => mosaik.test(message.url, message.token),
  "mosaik:backfill": () => mosaik.backfill(),
  "mosaik:send-now": () => mosaik.flush(),
  "mosaik:refresh-days": (message) => mosaik.refreshDays(message.force === true),
};

// The icon of every tab starts grey; a tab with a German video paints its own in orange
chrome.action.setIcon({ imageData: drawIcons(IDLE_COLOR) });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension can speak to us: its content scripts, and its own pages
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
    if (message.page) {
      // A video on another site is named after the page of its tab, which a frame cannot see: each part
      // of the time after the page it was watched on (see pages.js)
      const tab = sender.tab;
      const parts = splitByPage(tabPages, tab?.id, message.intervals, tab, Date.now() / 1000);
      for (const { url, title, intervals } of parts) {
        const video = cleanVideo({ id: webItemId(url), title: pageTitle(title), url });
        queue = queue.then(() => save(intervals, video)).catch(() => {});
      }
    } else {
      const video = cleanVideo(message.video);
      queue = queue.then(() => save(message.intervals, video)).catch(() => {});
    }
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
