/**
 * What Mosaik says about the days of every computer, so that the dashboard and the popup show the time
 * of all of them. Each computer (each Chrome profile) sends only its own time to Mosaik, which adds them
 * up; this asks for that sum (`GET /api/agent/deuchan/days`) and keeps it as `mosaikDays`:
 *
 *   { fetchedAt, device, days: { "2026-11-18": { seconds, devices: { "<name>": seconds },
 *                                               items: [{ id, title, url, kind, devices }] } } }
 *
 * `device` is the name Mosaik gives to this computer. What is shown is what this computer counted, live,
 * plus what Mosaik says of the others: the time of this one is never taken from Mosaik, which may be a
 * minute behind. Without Mosaik, it is this computer only.
 *
 * Everything here is a pure function on plain objects.
 */
import { dayKey, daysBefore } from "./log.js";
import { cleanUrl, isItemId } from "./items.js";

/** The days asked for: a year and a bit, as the charts show. Mosaik answers up to 400. */
export const DAYS_WINDOW = 400;

/** The days whose items are kept, as the videos of this computer are (see `videos.js`). */
export const ITEMS_DAYS = 60;

/** Asked again after this long, or when a page of the extension opens. */
export const REFRESH_MS = 5 * 60_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEVICES = 20;
const MAX_ITEMS = 200;
const SECONDS_IN_A_DAY = 25 * 3600;

const seconds = (value) => (Number.isFinite(value) && value > 0 ? Math.min(value, SECONDS_IN_A_DAY) : 0);

const deviceName = (value) => (typeof value === "string" && value.length > 0 ? value.slice(0, 64) : null);

/** `from` and `to` of the days to ask for, ending today. */
export function dayRange(today, count = DAYS_WINDOW) {
  return { from: dayKey(daysBefore(today, count - 1)), to: dayKey(today) };
}

function cleanDevices(devices) {
  const clean = {};
  for (const [name, value] of Object.entries(devices && typeof devices === "object" ? devices : {})) {
    if (deviceName(name) && Object.keys(clean).length < MAX_DEVICES && seconds(value) > 0) {
      clean[deviceName(name)] = seconds(value);
    }
  }
  return clean;
}

function cleanItem(item) {
  if (!isItemId(item?.id) && !(typeof item?.id === "string" && /^yt:[\w-]{11}$/.test(item.id))) {
    return null;
  }
  return {
    // Mosaik names a YouTube video `yt:<id>`; here it is the id alone, as in `videos`
    id: item.id.startsWith("yt:") ? item.id.slice(3) : item.id,
    title: typeof item.title === "string" ? item.title.slice(0, 200) : "",
    url: cleanUrl(item.url),
    kind: item.contentKind === "reading" ? "reading" : "video",
    devices: cleanDevices(item.devices),
  };
}

/**
 * The answer of Mosaik as it is kept: only what makes sense, and the items of the recent days only.
 *
 * @param {unknown} body  what `GET /api/agent/deuchan/days` answered
 * @param {Date} today
 */
export function cleanDaysAnswer(body, today) {
  const oldestItems = dayKey(daysBefore(today, ITEMS_DAYS - 1));
  const days = {};
  for (const [day, entry] of Object.entries(body?.days && typeof body.days === "object" ? body.days : {})) {
    if (!DAY.test(day)) {
      continue;
    }
    const items =
      day >= oldestItems && Array.isArray(entry?.items)
        ? entry.items.slice(0, MAX_ITEMS).map(cleanItem).filter(Boolean)
        : [];
    days[day] = { seconds: seconds(entry?.seconds), devices: cleanDevices(entry?.devices), items };
  }
  return days;
}

/** What was kept, or nothing. */
export function readMosaikDays(saved) {
  return {
    fetchedAt: Number.isFinite(saved?.fetchedAt) ? saved.fetchedAt : 0,
    device: deviceName(saved?.device),
    days: saved?.days && typeof saved.days === "object" ? saved.days : {},
  };
}

/** The seconds of the other computers on a day, as Mosaik says. */
export function othersOn(mosaikDays, day) {
  const { device, days } = readMosaikDays(mosaikDays);
  const entry = days[day];
  if (!entry || !device) {
    return 0;
  }
  return Object.entries(entry.devices ?? {})
    .filter(([name]) => name !== device)
    .reduce((sum, [, value]) => sum + seconds(value), 0);
}

/** Whether Mosaik said anything this computer can use: the days of the others need its own name. */
export const hasOthers = (mosaikDays) => readMosaikDays(mosaikDays).device !== null;

/**
 * The log to show: the days of this computer (with its corrections) plus the ones of the others.
 *
 * @param {{ days: object }} local  `shownLog` of this computer
 * @param {object} mosaikDays  what was kept from Mosaik
 */
export function withOtherDevices(local, mosaikDays) {
  const days = { ...local.days };
  for (const day of Object.keys(readMosaikDays(mosaikDays).days)) {
    const others = othersOn(mosaikDays, day);
    if (others > 0) {
      days[day] = (days[day] ?? 0) + others;
    }
  }
  return { ...local, days };
}

/**
 * The items of a day: the ones of this computer, with the seconds the others add to them, and the ones
 * only the others have. The longest first. `here` says whether this computer counted any of it.
 *
 * @param {{ id, title, seconds, url, kind }[]} local  `dayVideos` of this computer
 * @param {object} mosaikDays
 * @param {string} day
 */
export function dayItems(local, mosaikDays, day) {
  const { device, days } = readMosaikDays(mosaikDays);
  const items = new Map(local.map((item) => [item.id, { ...item, here: true, elsewhere: [] }]));
  for (const item of days[day]?.items ?? []) {
    const others = Object.entries(item.devices ?? {}).filter(([name]) => device && name !== device);
    const extra = others.reduce((sum, [, value]) => sum + seconds(value), 0);
    if (extra === 0) {
      continue;
    }
    const known = items.get(item.id);
    items.set(item.id, {
      id: item.id,
      title: known?.title || item.title,
      url: known?.url ?? item.url,
      kind: known?.kind ?? item.kind,
      seconds: (known?.seconds ?? 0) + extra,
      here: known !== undefined,
      elsewhere: others.map(([name]) => name),
    });
  }
  return [...items.values()].sort((a, b) => b.seconds - a.seconds);
}
