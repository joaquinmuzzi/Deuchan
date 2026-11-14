// The rules of the events that Mosaik takes, written down from its contract so that the tests can check
// every event the extension makes. Mosaik is in another repository: if its contract changes, this changes.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["watch_interval", "day_total", "video_removed"]);
const ALLOWED = {
  watch_interval: [
    "id",
    "source",
    "kind",
    "language",
    "from",
    "to",
    "seconds",
    "videoId",
    "title",
    "channelId",
  ],
  day_total: ["id", "source", "kind", "language", "day", "at", "seconds", "videos"],
  video_removed: ["id", "source", "kind", "language", "day", "at", "videoId"],
};

const isTime = (value) => Number.isInteger(value) && value > 0;

/** The problems of one event, as a list of texts: empty if it follows the contract. */
export function eventProblems(event) {
  if (!event || typeof event !== "object") {
    return ["not an object"];
  }
  const problems = [];
  const fail = (text) => problems.push(text);
  if (typeof event.id !== "string" || event.id.length === 0 || event.id.length > 200) fail("id");
  if (event.source !== "deuchan") fail("source");
  if (!KINDS.has(event.kind)) return [...problems, "kind"];
  if (event.language !== "de") fail("language");
  for (const key of Object.keys(event)) {
    if (!ALLOWED[event.kind].includes(key)) fail(`unknown field ${key}`);
  }

  if (event.kind === "watch_interval") {
    if (!isTime(event.from) || !isTime(event.to) || !(event.to > event.from)) fail("from/to");
    if (!(typeof event.seconds === "number" && event.seconds > 0 && event.seconds <= 21_600)) fail("seconds");
    if (event.seconds > (event.to - event.from) / 1000 + 1) fail("seconds longer than the interval");
    if (!VIDEO_ID.test(event.videoId ?? "")) fail("videoId");
    if (event.title !== undefined && (typeof event.title !== "string" || event.title.length > 500))
      fail("title");
    if (event.channelId !== undefined && typeof event.channelId !== "string") fail("channelId");
  }

  if (event.kind === "day_total") {
    if (!DAY.test(event.day ?? "")) fail("day");
    if (!isTime(event.at)) fail("at");
    if (!(typeof event.seconds === "number" && event.seconds >= 0 && event.seconds <= 90_000))
      fail("seconds");
    if (event.id !== `deuchan:day:${event.day}:${event.at}`) fail("id of a day total");
    if (event.videos !== undefined) {
      if (!Array.isArray(event.videos) || event.videos.length > 200) fail("videos");
      for (const video of event.videos ?? []) {
        if (!VIDEO_ID.test(video?.videoId ?? "")) fail("videos.videoId");
        if (typeof video?.title !== "string" || video.title.length > 500) fail("videos.title");
        if (!(typeof video?.seconds === "number" && video.seconds >= 0)) fail("videos.seconds");
      }
    }
  }

  if (event.kind === "video_removed") {
    if (!DAY.test(event.day ?? "")) fail("day");
    if (!isTime(event.at)) fail("at");
    if (!VIDEO_ID.test(event.videoId ?? "")) fail("videoId");
    if (event.id !== `deuchan:rm:${event.day}:${event.videoId}:${event.at}`) fail("id of a removal");
  }
  return problems;
}

/** The problems of a request body: 1 to 500 events, each one valid, with no id twice. */
export function batchProblems(body) {
  if (!Array.isArray(body?.events) || body.events.length < 1 || body.events.length > 500) {
    return ["events must be 1 to 500"];
  }
  const ids = body.events.map((event) => event?.id);
  const problems = body.events.flatMap((event, index) =>
    eventProblems(event).map((text) => `${index}: ${text}`),
  );
  if (new Set(ids).size !== ids.length) problems.push("an id twice in one batch");
  return problems;
}
