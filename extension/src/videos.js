/**
 * The videos that made the time of each day, so that a day that looks too long can be explained.
 * Kept as `videos`, `{ "2026-10-24": { "<video id>": { title, seconds } } }`, only on this computer:
 * it is never synced, and it is not part of what the other computers receive.
 *
 * It only holds the recent days and the longest videos of each, so that the storage does not grow
 * forever.
 */
import { isVideoId } from "./overrides.js";

/** The newest days that are kept. */
export const MAX_VIDEO_DAYS = 60;

/** The videos kept for a day: the ones with the most seconds. */
export const MAX_VIDEOS_PER_DAY = 100;

export const MAX_TITLE_LENGTH = 200;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What is known of a video that is playing: its id and its title, or `null` if it is not a video. */
export function cleanVideo(video) {
  if (!isVideoId(video?.id)) {
    return null;
  }
  const title = typeof video.title === "string" ? video.title.replace(/\s+/g, " ").trim() : "";
  return { id: video.id, title: title.slice(0, MAX_TITLE_LENGTH) };
}

/** A new set of videos with `seconds` more on a day for one video; the given one is not changed. */
export function addVideoSeconds(videos, day, video, seconds) {
  const clean = cleanVideo(video);
  if (!clean || !DAY.test(day) || !(seconds > 0)) {
    return videos ?? {};
  }
  const before = videos?.[day]?.[clean.id];
  const entries = {
    ...videos?.[day],
    // The title of the last time wins: a video can be renamed
    [clean.id]: { title: clean.title || before?.title || "", seconds: (before?.seconds ?? 0) + seconds },
  };
  const kept = Object.entries(entries)
    .sort(([, a], [, b]) => b.seconds - a.seconds)
    .slice(0, MAX_VIDEOS_PER_DAY);
  const days = { ...videos, [day]: Object.fromEntries(kept) };
  const newest = Object.keys(days).sort().slice(-MAX_VIDEO_DAYS);
  return Object.fromEntries(newest.map((key) => [key, days[key]]));
}

/** The videos of a day, the longest first. */
export function dayVideos(videos, day) {
  return Object.entries(videos?.[day] ?? {})
    .map(([id, { title, seconds }]) => ({ id, title, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** A new set of videos without one video of a day; the given one is not changed. */
export function removeVideo(videos, day, id) {
  const rest = Object.fromEntries(Object.entries(videos?.[day] ?? {}).filter(([key]) => key !== id));
  const days = { ...videos, [day]: rest };
  if (Object.keys(rest).length === 0) {
    delete days[day];
  }
  return days;
}
