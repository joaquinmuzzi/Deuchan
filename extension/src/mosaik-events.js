/**
 * The events that Deuchan sends to Mosaik, a hub that runs on the computer of the person and puts
 * together what they do to learn languages. Everything here is a pure function on plain objects, so
 * it can be tested without a browser; `mosaik-runner.js` keeps them and sends them.
 *
 * Three kinds of events:
 *
 * - `watch_interval`: a stretch of one item (a YouTube video, a video on another site, reading counted
 *   by hand), from one moment to another, and the seconds it counted.
 *   A content script reports every two seconds, and an event every two seconds would be too many, so
 *   the reports of the same video are joined into one event while they follow each other (the "open"
 *   one) and the event is closed when nothing came for a while, or when it is long enough. When another
 *   item plays at the same time (two tabs report in turns), the event waits apart, "parked", and goes on
 *   growing when its item reports again. Only closed events are sent: once sent, an event never changes.
 * - `day_total`: the total of a day on this computer, corrections included. Mosaik keeps the newest
 *   one of each computer and day, and adds the computers up, so each one has its own id.
 * - `video_removed`: the person took an item out of a day.
 *
 * The queue (`outbox`) is `{ open, parked, queued, dropped }`: the open event or `null`, the open events
 * of other items that played at the same time, the closed events
 * waiting to be sent, the oldest first, and how many were dropped because the queue was full.
 */
import { isVideoId } from "./overrides.js";
import { cleanUrl, isItemId, siteOf } from "./items.js";
import { DAY_START_HOUR } from "./log.js";
import { dayVideos, readingSeconds } from "./videos.js";

export const SOURCE = "deuchan";
export const LANGUAGE = "de";

/** Two reports of the same video this close are one event. */
export const JOIN_GAP_MS = 30_000;

/** An event that lasted this long is closed, so that events flow while a long video plays. */
export const MAX_EVENT_MS = 10 * 60_000;

/** The most events that wait. More than this means the hub has been off for weeks. */
export const MAX_QUEUED = 5000;

/** The most events in one request, as the hub takes them. */
export const MAX_BATCH = 500;

export const MAX_TITLE_LENGTH = 500;
export const MAX_DAY_VIDEOS = 200;
const MAX_DAY_SECONDS = 90_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Open events of other items kept while one plays: two or three tabs at once is already a lot. */
export const MAX_PARKED = 4;

export const emptyOutbox = () => ({ open: null, parked: [], queued: [], dropped: 0 });

const isEvent = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The queue as it was saved, or an empty one if there is none or it cannot be read. */
export function readOutbox(saved) {
  return {
    open: isEvent(saved?.open) ? saved.open : null,
    parked: Array.isArray(saved?.parked) ? saved.parked.filter(isEvent).slice(0, MAX_PARKED) : [],
    queued: Array.isArray(saved?.queued) ? saved.queued : [],
    dropped: Number.isFinite(saved?.dropped) ? saved.dropped : 0,
  };
}

/**
 * The fields that name an item for Mosaik: a YouTube `videoId`, or an `itemId` with its address, and
 * whether it is reading.
 */
export function itemFields(item) {
  const url = cleanUrl(item.url);
  const site = url ? siteOf(url) : null;
  return {
    ...(isVideoId(item.id) ? { videoId: item.id } : { itemId: item.id }),
    ...(url ? { url } : {}),
    ...(site && !isVideoId(item.id) ? { site } : {}),
    ...(item.kind === "reading" ? { contentKind: "reading" } : {}),
  };
}

const itemOf = (event) => event.videoId ?? event.itemId;

/** Seconds as Deuchan keeps them (epoch, with decimals) to the integer milliseconds of the hub. */
export const toMs = (seconds) => Math.round(seconds * 1000);

/** Seconds with at most three decimals: the hub does not need more, and a JSON number stays short. */
const tidySeconds = (seconds) => Math.round(seconds * 1000) / 1000;

const tidyTitle = (title) => (typeof title === "string" ? title.slice(0, MAX_TITLE_LENGTH) : "");

/** An open event becomes closed: its seconds never more than how long it lasted. */
function finish(event) {
  return { ...event, seconds: tidySeconds(Math.min(event.seconds, (event.to - event.from) / 1000)) };
}

/**
 * Adds events to the queue. A newer total of a day replaces the one of that day still waiting, as the
 * hub would only keep the newest. If the queue is full, the oldest intervals go first: the totals of the
 * days keep the time right without them.
 */
export function addToQueue(outbox, events) {
  const newDays = new Set(events.filter((event) => event.kind === "day_total").map((event) => event.day));
  let queued = [
    ...outbox.queued.filter((event) => !(event.kind === "day_total" && newDays.has(event.day))),
    ...events,
  ];
  let dropped = outbox.dropped ?? 0;
  if (queued.length > MAX_QUEUED) {
    const extra = queued.length - MAX_QUEUED;
    const oldIntervals = new Set(
      queued
        .filter((event) => event.kind === "watch_interval")
        .slice(0, extra)
        .map((event) => event.id),
    );
    queued = queued.filter((event) => !oldIntervals.has(event.id));
    // Without intervals left to drop, the oldest of anything
    queued = queued.slice(Math.max(0, queued.length - MAX_QUEUED));
    dropped += extra;
  }
  return { ...outbox, queued, dropped };
}

/** The open events (the one playing and the parked ones) are closed if nothing came for them for a while. */
export function closeIdle(outbox, nowMs) {
  const idle = (event) => nowMs - event.to > JOIN_GAP_MS;
  const parked = outbox.parked ?? [];
  const done = [...(outbox.open && idle(outbox.open) ? [outbox.open] : []), ...parked.filter(idle)];
  if (done.length === 0) {
    return outbox;
  }
  return addToQueue(
    {
      ...outbox,
      open: outbox.open && idle(outbox.open) ? null : outbox.open,
      parked: parked.filter((event) => !idle(event)),
    },
    done.sort((a, b) => a.to - b.to).map(finish),
  );
}

/**
 * A report of the content script, after the background script counted it: the interval in seconds
 * (`from`, `to`), the seconds of it that were new (`newSeconds`: two tabs playing at once count once),
 * and the item. Time with no item, or with nothing new, makes no event; the total of the day has it.
 *
 * @param {ReturnType<typeof emptyOutbox>} outbox
 * @param {{ from: number, to: number }} interval
 * @param {number} newSeconds
 * @param {{ id: string, title?: string, url?: string, kind?: string } | null} video
 * @param {() => string} randomUUID
 */
export function addWatched(outbox, interval, newSeconds, video, randomUUID) {
  if (!(newSeconds > 0) || !isItemId(video?.id)) {
    return outbox;
  }
  const from = toMs(interval.from);
  const to = toMs(interval.to);
  const open = outbox.open;
  const joinable = (event) =>
    itemOf(event) === video.id &&
    from - event.to <= JOIN_GAP_MS &&
    to >= event.from &&
    event.to - event.from < MAX_EVENT_MS;
  const extend = (event) => ({
    ...event,
    from: Math.min(event.from, from),
    to: Math.max(event.to, to),
    seconds: event.seconds + newSeconds,
  });
  if (open && joinable(open)) {
    return { ...outbox, open: extend(open) };
  }
  // Two tabs that play at once report in turns: each item keeps its own event, parked meanwhile
  let parked = outbox.parked ?? [];
  let toClose = [];
  if (open) {
    if (itemOf(open) === video.id) {
      toClose.push(open);
    } else {
      parked = [...parked, open];
    }
  }
  const waiting = parked.find(joinable);
  if (waiting) {
    parked = parked.filter((event) => event !== waiting);
  }
  // An event of this item that cannot grow any more is done
  toClose = [...toClose, ...parked.filter((event) => itemOf(event) === video.id)];
  parked = parked.filter((event) => itemOf(event) !== video.id);
  if (parked.length > MAX_PARKED) {
    const oldest = [...parked].sort((a, b) => a.to - b.to).slice(0, parked.length - MAX_PARKED);
    toClose = [...toClose, ...oldest];
    parked = parked.filter((event) => !oldest.includes(event));
  }
  const closed = {
    ...(toClose.length > 0 ? addToQueue(outbox, toClose.map(finish)) : outbox),
    parked,
  };
  if (waiting) {
    return { ...closed, open: extend(waiting) };
  }
  const title = tidyTitle(video.title);
  return {
    ...closed,
    open: {
      id: `deuchan:iv:${randomUUID()}`,
      source: SOURCE,
      kind: "watch_interval",
      language: LANGUAGE,
      from,
      to,
      seconds: newSeconds,
      ...itemFields(video),
      ...(title ? { title } : {}),
    },
  };
}

/** The total of a day on this computer, at the moment `at`, with its items. */
export function dayTotalEvent(day, at, seconds, videos) {
  const list = dayVideos(videos, day)
    .slice(0, MAX_DAY_VIDEOS)
    .map((video) => ({
      ...itemFields(video),
      title: tidyTitle(video.title),
      seconds: tidySeconds(video.seconds),
    }));
  const total = shownSeconds(seconds);
  const reading = Math.min(total, Math.floor(readingSeconds(videos, day)));
  return {
    id: `deuchan:day:${day}:${at}`,
    source: SOURCE,
    kind: "day_total",
    language: LANGUAGE,
    day,
    at,
    seconds: total,
    ...(reading > 0 ? { readingSeconds: reading } : {}),
    ...(list.length > 0 ? { videos: list } : {}),
  };
}

/** An item that the person took out of a day. */
export const videoRemovedEvent = (day, at, id) => ({
  id: `deuchan:rm:${day}:${id}:${at}`,
  source: SOURCE,
  kind: "video_removed",
  language: LANGUAGE,
  day,
  // So that Mosaik knows which stretches belong to that day
  dayStartHour: DAY_START_HOUR,
  at,
  ...(isVideoId(id) ? { videoId: id } : { itemId: id }),
});

/** The seconds of a day as the dashboard shows them: whole seconds, rounded down, within what a day holds. */
export const shownSeconds = (seconds) => Math.min(MAX_DAY_SECONDS, Math.max(0, Math.floor(seconds ?? 0)));

/**
 * The days whose total is not the one sent last: all the days the dashboard shows, and the ones that
 * were sent and are not shown any more (a day corrected to zero), with the total to send.
 *
 * @param {{ [day: string]: number }} shown  the days of the dashboard
 * @param {{ [day: string]: number }} sent  the last total sent of each day
 */
export function changedDays(shown, sent) {
  const days = new Set([...Object.keys(shown), ...Object.keys(sent ?? {})].filter((day) => DAY.test(day)));
  return [...days]
    .sort()
    .map((day) => ({ day, seconds: shownSeconds(shown[day]) }))
    .filter(({ day, seconds }) => (sent?.[day] === undefined ? seconds > 0 : sent[day] !== seconds));
}

/**
 * The history: the total of every day of this computer, with its items where they were kept, and a zero
 * for every day that was sent before and has no time here now (the old sync sent the time of all the
 * computers together).
 */
export function backfillEvents(shown, videos, at, sent = {}) {
  const days = new Set([
    ...Object.keys(shown).filter((day) => shownSeconds(shown[day]) > 0),
    ...Object.keys(sent ?? {}).filter((day) => !(shownSeconds(shown[day]) > 0)),
  ]);
  return [...days]
    .filter((day) => DAY.test(day))
    .sort()
    .map((day) => dayTotalEvent(day, at, shown[day] ?? 0, videos));
}

/** The first events of the queue, to send them. */
export const takeBatch = (outbox, size) => outbox.queued.slice(0, Math.min(size, MAX_BATCH));

/** The queue without the events that were sent, by id: whatever was added meanwhile stays. */
export function removeSent(outbox, ids) {
  const sent = new Set(ids);
  return { ...outbox, queued: outbox.queued.filter((event) => !sent.has(event.id)) };
}

/** How many events wait, the open ones included. */
export const pendingCount = (outbox) =>
  outbox.queued.length + (outbox.open ? 1 : 0) + (outbox.parked?.length ?? 0);
