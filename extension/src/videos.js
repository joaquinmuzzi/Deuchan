/**
 * The items that made the time of each day, so that a day that looks too long can be explained.
 * Kept as `videos`, `{ "2026-10-24": { "<item id>": { title, seconds, url?, kind? } } }`. Only what was
 * counted here: what the other computers counted comes from Mosaik (see `mosaik-days.js`).
 *
 * An item is a YouTube video or anything else (see `items.js`). `kind` is `"reading"` for time counted
 * by hand; there is none for a video.
 *
 * It only holds the recent days and the longest items of each, so that the storage does not grow
 * forever.
 */
import { cleanUrl, isItemId } from "./items.js";

/** The newest days that are kept. */
export const MAX_VIDEO_DAYS = 60;

/** The items kept for a day: the ones with the most seconds. */
export const MAX_VIDEOS_PER_DAY = 100;

export const MAX_TITLE_LENGTH = 200;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What is known of the item that is counted: its id, its title, and maybe its address and whether it is
 * reading. `null` if it is not an item.
 */
export function cleanVideo(video) {
  if (!isItemId(video?.id)) {
    return null;
  }
  const title = typeof video.title === "string" ? video.title.replace(/\s+/g, " ").trim() : "";
  const url = cleanUrl(video.url);
  return {
    id: video.id,
    title: title.slice(0, MAX_TITLE_LENGTH),
    ...(url ? { url } : {}),
    ...(video.kind === "reading" ? { kind: "reading" } : {}),
  };
}

/** A new set of items with `seconds` more on a day for one item; the given one is not changed. */
export function addVideoSeconds(videos, day, video, seconds) {
  const clean = cleanVideo(video);
  if (!clean || !DAY.test(day) || !(seconds > 0)) {
    return videos ?? {};
  }
  const before = videos?.[day]?.[clean.id];
  const url = clean.url ?? before?.url;
  const kind = clean.kind ?? before?.kind;
  const entries = {
    ...videos?.[day],
    // The title of the last time wins: a video can be renamed
    [clean.id]: {
      title: clean.title || before?.title || "",
      seconds: (before?.seconds ?? 0) + seconds,
      ...(url ? { url } : {}),
      ...(kind ? { kind } : {}),
    },
  };
  const kept = Object.entries(entries)
    .sort(([, a], [, b]) => b.seconds - a.seconds)
    .slice(0, MAX_VIDEOS_PER_DAY);
  const days = { ...videos, [day]: Object.fromEntries(kept) };
  const newest = Object.keys(days).sort().slice(-MAX_VIDEO_DAYS);
  return Object.fromEntries(newest.map((key) => [key, days[key]]));
}

/** The items of a day, the longest first. */
export function dayVideos(videos, day) {
  return Object.entries(videos?.[day] ?? {})
    .map(([id, { title, seconds, url, kind }]) => ({
      id,
      title,
      seconds,
      url: cleanUrl(url),
      kind: kind === "reading" ? "reading" : "video",
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** The seconds of a day counted by hand as reading. */
export const readingSeconds = (videos, day) =>
  dayVideos(videos, day)
    .filter((video) => video.kind === "reading")
    .reduce((sum, video) => sum + video.seconds, 0);

/** A new set of items without one item of a day; the given one is not changed. */
export function removeVideo(videos, day, id) {
  const rest = Object.fromEntries(Object.entries(videos?.[day] ?? {}).filter(([key]) => key !== id));
  const days = { ...videos, [day]: rest };
  if (Object.keys(rest).length === 0) {
    delete days[day];
  }
  return days;
}
