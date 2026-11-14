/**
 * The events that Deuchan sends to Mosaik, a hub that runs on the computer of the person and puts
 * together what they do to learn languages. Everything here is a pure function on plain objects, so
 * it can be tested without a browser; `mosaik-runner.js` keeps them and sends them.
 *
 * Three kinds of events:
 *
 * - `watch_interval`: a stretch of one video, from one moment to another, and the seconds it counted.
 *   A content script reports every two seconds, and an event every two seconds would be too many, so
 *   the reports of the same video are joined into one event while they follow each other (the "open"
 *   one) and the event is closed when the video changes, when nothing came for a while, or when it is
 *   long enough. Only closed events are sent: once sent, an event never changes.
 * - `day_total`: the total of a day as the dashboard shows it, corrections and other computers
 *   included. The hub keeps the newest one of each day, so each one has its own id.
 * - `video_removed`: the person took a video out of a day.
 *
 * The queue (`outbox`) is `{ open, queued, dropped }`: the open event or `null`, the closed events
 * waiting to be sent, the oldest first, and how many were dropped because the queue was full.
 */
import { dayVideos } from "./videos.js";

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
const VIDEO_ID = /^[\w-]{11}$/;

export const emptyOutbox = () => ({ open: null, queued: [], dropped: 0 });

/** The queue as it was saved, or an empty one if there is none or it cannot be read. */
export function readOutbox(saved) {
  return {
    open: saved?.open && typeof saved.open === "object" ? saved.open : null,
    queued: Array.isArray(saved?.queued) ? saved.queued : [],
    dropped: Number.isFinite(saved?.dropped) ? saved.dropped : 0,
  };
}

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

/** The open event is closed if nothing came for it for a while. */
export function closeIdle(outbox, nowMs) {
  if (!outbox.open || nowMs - outbox.open.to <= JOIN_GAP_MS) {
    return outbox;
  }
  return addToQueue({ ...outbox, open: null }, [finish(outbox.open)]);
}

/**
 * A report of the content script, after the background script counted it: the interval in seconds
 * (`from`, `to`), the seconds of it that were new (`newSeconds`: two tabs playing at once count once),
 * and the video. Time with no video, or with nothing new, makes no event; the total of the day has it.
 *
 * @param {ReturnType<typeof emptyOutbox>} outbox
 * @param {{ from: number, to: number }} interval
 * @param {number} newSeconds
 * @param {{ id: string, title?: string } | null} video
 * @param {() => string} randomUUID
 */
export function addWatched(outbox, interval, newSeconds, video, randomUUID) {
  if (!(newSeconds > 0) || !VIDEO_ID.test(video?.id ?? "")) {
    return outbox;
  }
  const from = toMs(interval.from);
  const to = toMs(interval.to);
  const open = outbox.open;
  if (
    open &&
    open.videoId === video.id &&
    from - open.to <= JOIN_GAP_MS &&
    to >= open.from &&
    open.to - open.from < MAX_EVENT_MS
  ) {
    return {
      ...outbox,
      open: {
        ...open,
        from: Math.min(open.from, from),
        to: Math.max(open.to, to),
        seconds: open.seconds + newSeconds,
      },
    };
  }
  const closed = open ? addToQueue(outbox, [finish(open)]) : outbox;
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
      videoId: video.id,
      ...(title ? { title } : {}),
    },
  };
}

/** The total of a day as the dashboard shows it, at the moment `at`. */
export function dayTotalEvent(day, at, seconds, videos) {
  const list = dayVideos(videos, day)
    .slice(0, MAX_DAY_VIDEOS)
    .map((video) => ({
      videoId: video.id,
      title: tidyTitle(video.title),
      seconds: tidySeconds(video.seconds),
    }));
  return {
    id: `deuchan:day:${day}:${at}`,
    source: SOURCE,
    kind: "day_total",
    language: LANGUAGE,
    day,
    at,
    seconds: shownSeconds(seconds),
    ...(list.length > 0 ? { videos: list } : {}),
  };
}

/** A video that the person took out of a day. */
export const videoRemovedEvent = (day, at, videoId) => ({
  id: `deuchan:rm:${day}:${videoId}:${at}`,
  source: SOURCE,
  kind: "video_removed",
  language: LANGUAGE,
  day,
  at,
  videoId,
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

/** The history: the total of every day the dashboard shows, with its videos where they were kept. */
export function backfillEvents(shown, videos, at) {
  return Object.keys(shown)
    .filter((day) => DAY.test(day) && shownSeconds(shown[day]) > 0)
    .sort()
    .map((day) => dayTotalEvent(day, at, shown[day], videos));
}

/** The first events of the queue, to send them. */
export const takeBatch = (outbox, size) => outbox.queued.slice(0, Math.min(size, MAX_BATCH));

/** The queue without the events that were sent, by id: whatever was added meanwhile stays. */
export function removeSent(outbox, ids) {
  const sent = new Set(ids);
  return { ...outbox, queued: outbox.queued.filter((event) => !sent.has(event.id)) };
}

/** How many events wait, the open one included. */
export const pendingCount = (outbox) => outbox.queued.length + (outbox.open ? 1 : 0);
