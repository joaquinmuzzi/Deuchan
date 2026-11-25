// The only place that writes the log, so that several tabs cannot overwrite each other: every update
// waits for the one before it. It also counts the time two tabs played at once only once (see
// coverage.js), and paints the toolbar icon of each tab. When the person turns on sending to Mosaik, it
// also keeps what it counts in the queue of Mosaik, in the same write (see mosaik-runner.js).
//
// It also keeps the immersion profile going (immersion.js), with the tabs that play sound there
// (audio.js), and the reading counted by hand (manual.js).
import {
  AUDIO_ALARM,
  flushSound,
  forgetSound,
  hears,
  isCounting,
  readSound,
  resumeSound,
  setHeard,
} from "./audio.js";
import { addCoverage, isValidInterval } from "./coverage.js";
import { correctDay, isDayKey } from "./corrections.js";
import { IDLE_COLOR, drawIcons, iconColor } from "./icon.js";
import { IMMERSION_PERMISSIONS, IMMERSION_SCRIPT_ID, immersionOf, immersionScript } from "./immersion.js";
import { isItemId, webItemId } from "./items.js";
import { createKechimochiRunner } from "./kechimochi-runner.js";
import { LEGACY_ALARMS, LEGACY_KEYS, localizeCorrections } from "./legacy-sync.js";
import { addSeconds, dayKey, migrate, shownLog } from "./log.js";
import { IDLE_SECONDS, MANUAL_ALARM, flushManual, manualItem, readManual, startManual } from "./manual.js";
import { othersOn } from "./mosaik-days.js";
import { createMosaikRunner, queueRemoval, queueWatched } from "./mosaik-runner.js";
import { overridesKey, withOverride } from "./overrides.js";
import { forgetTab, knowPage, pageTitle, splitByPage, trackPage } from "./pages.js";
import {
  SITES_KEY,
  STREAMING_SITES,
  enabledSites,
  sitePermissions,
  siteScriptIds,
  siteScripts,
} from "./sites.js";
import { TARGET_HASH, TARGET_KEY } from "./target.js";
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

// "Send to Kechimochi" only reads the log and the items: it needs no place in the single writer
const kechimochi = createKechimochiRunner({
  storage: chrome.storage.local,
  alarms: chrome.alarms,
  permissions: chrome.permissions,
});

async function save(intervals, video) {
  const stored = await chrome.storage.local.get([
    "log",
    "covered",
    "videos",
    "mosaikSettings",
    "mosaikOutbox",
    TARGET_KEY,
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

/**
 * Saves time on a page of another site: each part after the page of the tab it was on (see pages.js).
 * In the single writer. `kind` is `"sound"` for what a tab played with no video counted on it.
 */
async function savePageTime(tabId, tab, intervals, kind) {
  const parts = splitByPage(tabPages, tabId, intervals, tab, Date.now() / 1000);
  for (const part of parts) {
    const video = cleanVideo({ id: webItemId(part.url), title: pageTitle(part.title), url: part.url, kind });
    await save(part.intervals, video);
  }
}

/** Remembers what the person said about a video, among the decisions of the target language they learn now. */
async function saveOverride(videoId, inTarget) {
  const key = overridesKey((await chrome.storage.local.get(TARGET_KEY))[TARGET_KEY]);
  const { [key]: overrides } = await chrome.storage.local.get(key);
  await chrome.storage.local.set({ [key]: withOverride(overrides, videoId, inTarget) });
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

/** An item of a day was not in the target language: the day loses its time here, and a video will not count again. */
async function removeFromDay(day, id) {
  const stored = await chrome.storage.local.get([
    "log",
    "videos",
    "mosaikDays",
    "mosaikSettings",
    "mosaikOutbox",
    TARGET_KEY,
  ]);
  const seconds = stored.videos?.[day]?.[id]?.seconds ?? 0;
  const total = (shownLog(migrate(stored.log)).days[day] ?? 0) + othersOn(stored.mosaikDays, day);
  // Mosaik is told too; the new total of the day goes with its next sending, as every changed day does
  const mosaikOutbox = queueRemoval(stored, day, id, Date.now());
  await chrome.storage.local.set({
    videos: removeVideo(stored.videos, day, id),
    ...(mosaikOutbox ? { mosaikOutbox } : {}),
  });
  // A YouTube video or a streaming title will not count again; for other pages the decision is harmless
  if (isItemId(id)) {
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
// the address and title of the tabs Inputly can see, which in the immersion profile is every one.
let tabPages = {};
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.audible !== undefined || change.mutedInfo !== undefined || change.url !== undefined) {
    stepAudio({ tabId, tab }).catch(() => {});
  }
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
  // The sound of a closed tab ends, named after its last page; then its pages go
  stepAudio({ tabId, tab: null })
    .catch(() => {})
    .finally(() => {
      tabPages = forgetTab(tabPages, tabId);
    });
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

// The streaming sites (see sites.js)

/**
 * Makes the scripts of each streaming site match the setting: there while the site is on and its access is
 * granted, gone otherwise (the person can take the access back from the browser's own pages).
 */
async function scheduleStreaming() {
  if (!chrome.scripting) {
    return;
  }
  const on = new Set(enabledSites((await chrome.storage.local.get(SITES_KEY))[SITES_KEY]));
  const registered = new Set(
    (await chrome.scripting.getRegisteredContentScripts()).map((script) => script.id),
  );
  for (const site of STREAMING_SITES) {
    const wanted = on.has(site.id) && (await chrome.permissions.contains(sitePermissions(site)));
    const ids = siteScriptIds(site);
    const there = ids.filter((id) => registered.has(id));
    if (wanted && there.length < ids.length) {
      if (there.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: there });
      }
      await chrome.scripting.registerContentScripts(siteScripts(site));
    } else if (!wanted && there.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: there });
    }
  }
}

// Sound in the immersion profile (see audio.js)

async function immersionOn() {
  const { immersion } = await chrome.storage.local.get("immersion");
  return immersionOf(immersion) && (await chrome.permissions.contains(IMMERSION_PERMISSIONS));
}

/**
 * Counts what the tabs that play sound played, in the single writer. With `tabId`, that tab changed:
 * `tab` is how it is now, or null when it was closed, and `notInTarget` is set when the person said what
 * its page is. Without it, every tab is looked at again and what is open is counted: a minute went by,
 * or the immersion profile was turned on or off.
 */
function stepAudio({ tabId, tab, notInTarget } = {}) {
  // When it happened, not when its turn comes: a page that came after it must get none of its time
  const now = Date.now() / 1000;
  return enqueue(async () => {
    const stored = await chrome.storage.session.get(["sound", "audioQuiet"]);
    let sound = readSound(stored.sound);
    const quiet = { ...stored.audioQuiet };
    const on = await immersionOn();
    let tabs;
    if (tabId === undefined) {
      const playing = on ? await chrome.tabs.query({ audible: true }) : [];
      const known = new Set(playing.map((each) => String(each.id)));
      const gone = await Promise.all(
        Object.keys(sound.open)
          .filter((key) => !known.has(key))
          .map((key) => chrome.tabs.get(Number(key)).catch(() => ({ id: Number(key), closed: true }))),
      );
      tabs = [...playing, ...gone];
    } else {
      tabs = [tab ?? { id: tabId, closed: true }];
    }
    // The background script may have been stopped since the sound started, and forgotten the pages
    for (const [id, stretch] of Object.entries(sound.open)) {
      tabPages = knowPage(tabPages, id, stretch);
    }
    // The computer may have slept since the tabs were looked at: the sound until then counts, not the wait
    const resumed = resumeSound(sound, now);
    for (const part of resumed.parts) {
      await savePageTime(part.tabId, sound.open[part.tabId], [part.interval], "sound");
    }
    sound = resumed.sound;
    for (const current of tabs) {
      const url = current.url ?? "";
      if (notInTarget !== undefined && current.id === tabId) {
        if (notInTarget) {
          quiet[tabId] = url;
        } else {
          delete quiet[tabId];
        }
      }
      // A page said to be not in the target language stays so until it changes address
      if (quiet[current.id] !== undefined && (current.closed || quiet[current.id] !== url)) {
        delete quiet[current.id];
      }
      const heard = on && !current.closed && hears(current) && quiet[current.id] === undefined;
      // What was heard before the page was said to be not in the target language is not counted either
      if (notInTarget === true && current.id === tabId) {
        sound = forgetSound(sound, current.id);
      }
      const changed = setHeard(sound, current, heard, now);
      sound = current.closed ? forgetSound(changed.sound, current.id) : changed.sound;
      if (changed.interval) {
        await savePageTime(current.id, current.closed ? null : current, [changed.interval], "sound");
      }
    }
    if (tabId === undefined) {
      const flushed = flushSound(sound, now);
      sound = flushed.sound;
      for (const part of flushed.parts) {
        const current = tabs.find((each) => each.id === part.tabId);
        await savePageTime(part.tabId, current, [part.interval], "sound");
      }
    }
    await chrome.storage.session.set({ sound: { ...sound, checkedAt: now }, audioQuiet: quiet });
    if (Object.keys(sound.open).length > 0) {
      if (!(await chrome.alarms.get(AUDIO_ALARM))) {
        await chrome.alarms.create(AUDIO_ALARM, { periodInMinutes: 1 });
      }
    } else {
      await chrome.alarms.clear(AUDIO_ALARM);
    }
  });
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

chrome.runtime.onInstalled.addListener(({ reason }) => {
  leaveLegacySync().catch(() => {});
  // Only a new install asks for the language: an update keeps counting what it counted (German, if it
  // was never set), so whoever has the extension already notices nothing
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs
      .create({ url: chrome.runtime.getURL(`dashboard/dashboard.html${TARGET_HASH}`) })
      .catch(() => {});
  }
});

// The alarms that start the sending to Mosaik are kept by the browser, but this makes sure they are
// there (and that there is none while it is off); the same for the script of the immersion profile
mosaik.schedule().catch(() => {});
kechimochi.schedule().catch(() => {});
scheduleImmersion().catch(() => {});
scheduleStreaming().catch(() => {});
stepAudio().catch(() => {});
// In the single writer, so that a session the browser start ends (below) is not shown again after it
enqueue(async () => {
  const { manualSession } = await chrome.storage.local.get("manualSession");
  const reading = readManual(manualSession) !== null;
  // The browser keeps alarms when the background script stops, but may lose them when it restarts:
  // a session without its alarm would wait, with nothing counted, until someone stopped it
  if (reading && !(await chrome.alarms.get(MANUAL_ALARM))) {
    await chrome.alarms.create(MANUAL_ALARM, { periodInMinutes: 1 });
  }
  await showManual(reading);
}).catch(() => {});
// The browser starts again (it was closed, or it crashed): a reading session left open was on a tab that
// is gone, so it ends at its last minute (see manual.js)
chrome.runtime.onStartup.addListener(() => {
  enqueue(() => stepManual({ restart: true })).catch(() => {});
});
chrome.alarms.onAlarm.addListener(({ name }) => {
  mosaik.onAlarm(name).catch(() => {});
  kechimochi.onAlarm(name).catch(() => {});
  if (name === AUDIO_ALARM) {
    stepAudio().catch(() => {});
  }
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
    stepAudio().catch(() => {});
  }
  if (area === "local" && changes[SITES_KEY]) {
    scheduleStreaming().catch(() => {});
  }
});
chrome.permissions.onRemoved.addListener(() => {
  scheduleImmersion().catch(() => {});
  scheduleStreaming().catch(() => {});
  stepAudio().catch(() => {});
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
  "streaming:refresh": () => scheduleStreaming().then(() => ({})),
  "audio:status": async (message) => {
    const sound = readSound((await chrome.storage.session.get("sound")).sound);
    if (!Object.hasOwn(sound.open, String(message.tabId))) {
      return { sound: null };
    }
    return { sound: isCounting(sound, message.tabId, Date.now() / 1000) ? "counting" : "waiting" };
  },
  "manual:start": (message) => manualStart(message),
  "manual:stop": () => enqueue(() => stepManual({ stop: true })).then(() => ({})),
  "mosaik:enable": (message) => mosaik.enable(message.url, message.token),
  "mosaik:disable": () => mosaik.disable(),
  "mosaik:test": (message) => mosaik.test(message.url, message.token),
  "mosaik:backfill": () => mosaik.backfill(),
  "mosaik:send-now": () => mosaik.flush(),
  "mosaik:refresh-days": (message) => mosaik.refreshDays(message.force === true),
  "kechimochi:enable": (message) => kechimochi.enable(message.url),
  "kechimochi:disable": () => kechimochi.disable(),
  "kechimochi:test": (message) => kechimochi.test(message.url),
  "kechimochi:send-now": () => kechimochi.flush(),
};

// The icon of every tab starts grey; a tab with a video in the target language paints its own in orange
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
    const video = message.page ? null : cleanVideo(message.video);
    // A video on another site is named after the page of its tab, which a frame cannot see
    const saved = enqueue(() =>
      message.page
        ? savePageTime(sender.tab?.id, sender.tab, message.intervals)
        : save(message.intervals, video),
    );
    // The answer says the time is written: until then it lives only in this script, which can be stopped
    // at any moment, so the page keeps it and sends it again if no answer comes (see delivery.js)
    saved.then(
      () => sendResponse({}),
      () => sendResponse({ error: "unknown" }),
    );
    return true;
  } else if (
    message?.type === "override" &&
    isItemId(message.videoId) &&
    typeof message.inTarget === "boolean"
  ) {
    queue = queue.then(() => saveOverride(message.videoId, message.inTarget)).catch(() => {});
  } else if (message?.type === "language" && sender.tab?.id !== undefined) {
    chrome.action.setIcon({ tabId: sender.tab.id, imageData: drawIcons(iconColor(message.inTarget)) });
    // The sound of a page on another site said to be not in the target language does not count either
    if (typeof message.inTarget === "boolean" && message.page === true) {
      stepAudio({ tabId: sender.tab.id, tab: sender.tab, notInTarget: !message.inTarget }).catch(() => {});
    }
  }
});
