/**
 * The videos that made the time of each day, so that a day that looks too long can be explained.
 * Kept as `videos`, `{ "2026-10-24": { "<video id>": { title, seconds, off? } } }`: what this computer
 * watched. The other computers' are kept apart, inside `others` (see `sync-data.js`), and the list of a
 * day shows all of them (`dayVideos`).
 *
 * It only holds the recent days and the longest videos of each, so that the storage does not grow
 * forever, and only a smaller part of it is synced (`forSync`), so that the block stays small.
 *
 * A video taken out of a day (`off`) is not deleted but marked, with its seconds: the copies of the
 * days merge by keeping the larger seconds, and a deleted video would come back with the next sync.
 */
import { isVideoId } from "./overrides.js";

/** The newest days that are kept on this computer. */
export const MAX_VIDEO_DAYS = 60;

/** The videos kept for a day: the ones with the most seconds. */
export const MAX_VIDEOS_PER_DAY = 100;

export const MAX_TITLE_LENGTH = 200;

/** What is synced: fewer days, fewer videos and shorter titles, as every computer sends its own. */
export const SYNC_VIDEO_DAYS = 14;
export const SYNC_VIDEOS_PER_DAY = 10;
export const SYNC_TITLE_LENGTH = 100;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SECONDS_IN_A_DAY = 24 * 3600;

const tidy = (title, limit) =>
  typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, limit) : "";

/** What is known of a video that is playing: its id and its title, or `null` if it is not a video. */
export function cleanVideo(video) {
  if (!isVideoId(video?.id)) {
    return null;
  }
  return { id: video.id, title: tidy(video.title, MAX_TITLE_LENGTH) };
}

/** Keeps the newest days, and in each the videos taken out and then the longest ones. */
function limit(days, maxDays, maxVideos) {
  const newest = Object.keys(days).sort().slice(-maxDays);
  return Object.fromEntries(
    newest.map((day) => {
      const entries = Object.entries(days[day]);
      const off = entries.filter(([, entry]) => entry.off);
      const rest = entries.filter(([, entry]) => !entry.off).sort(([, a], [, b]) => b.seconds - a.seconds);
      return [day, Object.fromEntries([...off, ...rest].slice(0, maxVideos))];
    }),
  );
}

/**
 * The videos that make sense, from outside (another computer, or the storage): a date, a video id,
 * a title and some seconds, at most a day. The rest is dropped.
 */
export function sanitizeVideos(videos) {
  if (!videos || typeof videos !== "object") {
    return {};
  }
  const clean = {};
  for (const [day, entries] of Object.entries(videos).slice(0, MAX_VIDEO_DAYS * 2)) {
    if (!DAY.test(day) || !entries || typeof entries !== "object") {
      continue;
    }
    for (const [id, entry] of Object.entries(entries).slice(0, MAX_VIDEOS_PER_DAY * 2)) {
      if (isVideoId(id) && Number.isFinite(entry?.seconds) && entry.seconds >= 0) {
        clean[day] ??= {};
        clean[day][id] = {
          title: tidy(entry.title, MAX_TITLE_LENGTH),
          seconds: Math.min(entry.seconds, SECONDS_IN_A_DAY),
        };
        if (entry.off === true) {
          clean[day][id].off = true;
        }
      }
    }
  }
  return limit(clean, MAX_VIDEO_DAYS, MAX_VIDEOS_PER_DAY);
}

/** Puts two sets of videos together: the larger seconds of each video, and a video taken out stays out. */
export function mergeVideos(first, second) {
  const a = sanitizeVideos(first);
  const b = sanitizeVideos(second);
  const merged = {};
  for (const day of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[day] = { ...a[day] };
    for (const [id, entry] of Object.entries(b[day] ?? {})) {
      const before = merged[day][id];
      if (!before) {
        merged[day][id] = entry;
        continue;
      }
      const bigger = entry.seconds > before.seconds ? entry : before;
      merged[day][id] = {
        title: bigger.title || entry.title || before.title,
        seconds: bigger.seconds,
        ...(before.off || entry.off ? { off: true } : {}),
      };
    }
  }
  return limit(merged, MAX_VIDEO_DAYS, MAX_VIDEOS_PER_DAY);
}

/** The part of the videos that is sent to the other computers. */
export function forSync(videos) {
  const shorter = Object.fromEntries(
    Object.entries(sanitizeVideos(videos)).map(([day, entries]) => [
      day,
      Object.fromEntries(
        Object.entries(entries).map(([id, entry]) => [
          id,
          { ...entry, title: tidy(entry.title, SYNC_TITLE_LENGTH) },
        ]),
      ),
    ]),
  );
  return limit(shorter, SYNC_VIDEO_DAYS, SYNC_VIDEOS_PER_DAY);
}

/** A new set of videos with `seconds` more on a day for one video; the given one is not changed. */
export function addVideoSeconds(videos, day, video, seconds) {
  const clean = cleanVideo(video);
  if (!clean || !DAY.test(day) || !(seconds > 0)) {
    return videos ?? {};
  }
  const before = videos?.[day]?.[clean.id];
  const entry = {
    // The title of the last time wins: a video can be renamed
    title: clean.title || before?.title || "",
    seconds: (before?.seconds ?? 0) + seconds,
    ...(before?.off ? { off: true } : {}),
  };
  return limit(
    { ...videos, [day]: { ...videos?.[day], [clean.id]: entry } },
    MAX_VIDEO_DAYS,
    MAX_VIDEOS_PER_DAY,
  );
}

/**
 * The videos of a day on all the computers, the longest first. A video that was watched on more than
 * one has the sum of its seconds, and one that was taken out on any of them is not listed.
 *
 * @param {object} videos  what this computer watched
 * @param {object} [others]  what it knows of the other computers, `{ [deviceId]: { videos } }`
 */
export function dayVideos(videos, day, others = {}) {
  const sources = [videos, ...Object.values(others ?? {}).map((device) => device?.videos)];
  const found = new Map();
  for (const source of sources) {
    for (const [id, entry] of Object.entries(source?.[day] ?? {})) {
      const before = found.get(id);
      found.set(id, {
        id,
        title: before?.title || entry.title,
        seconds: (before?.seconds ?? 0) + entry.seconds,
        off: Boolean(before?.off || entry.off),
      });
    }
  }
  return [...found.values()]
    .filter((video) => !video.off)
    .map(({ id, title, seconds }) => ({ id, title, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * A new set of videos with one video of a day taken out; the given one is not changed. It is marked,
 * not deleted, so that it does not come back when the computers sync. If this computer never saw the
 * video (another one did), it is marked all the same.
 */
export function removeVideo(videos, day, id) {
  if (!DAY.test(day) || !isVideoId(id)) {
    return videos ?? {};
  }
  const before = videos?.[day]?.[id];
  return limit(
    {
      ...videos,
      [day]: {
        ...videos?.[day],
        [id]: { title: before?.title ?? "", seconds: before?.seconds ?? 0, off: true },
      },
    },
    MAX_VIDEO_DAYS,
    MAX_VIDEOS_PER_DAY,
  );
}
