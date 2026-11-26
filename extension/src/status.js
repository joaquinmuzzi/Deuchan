import { MIN_SOUND_SECONDS } from "./audio.js";
import { DEFAULT_TARGET, languageName } from "./target.js";

/**
 * What the popup says about the video of the current tab. `reply` is what the content script
 * answered, or `undefined` when there is no content script there (a page that is not YouTube, out of
 * the immersion profile, or a page with no video). `reply.immersion` is true in the immersion profile.
 *
 * `sound` is for a tab that plays sound in the immersion profile (see audio.js): `"counting"`, or
 * `"waiting"` while it has not lasted enough to count. Null when it plays none.
 *
 * `language` is the name of the target language, as `targetName` gives it ("German"): the texts say it.
 *
 * `reply.ad` is true while an ad plays in the player: it is not counted, whatever the video's language.
 *
 * `reply.title` is the title of what plays (a YouTube video, an episode on a streaming site): `title` says
 * it under the status, so that the person sees what the verdict is about.
 *
 * `action` is the link to correct a wrong guess about the language: `inTarget` is what pressing it
 * decides. There is none while the language is not known, or when there is no video.
 */
export function describeStatus(reply, sound = null, language = languageName(DEFAULT_TARGET)) {
  const status = statusOf(reply, sound, language);
  const title = typeof reply?.title === "string" ? reply.title.trim() : "";
  return title && !reply.ad ? { ...status, title } : status;
}

function statusOf(reply, sound, language) {
  if (!reply) {
    if (sound === "counting") {
      return { kind: "counting", text: "Counting sound (immersion profile)" };
    }
    return sound === "waiting"
      ? { kind: "idle", text: `Sound, counted after ${MIN_SOUND_SECONDS} seconds` }
      : { kind: "idle", text: "No video here" };
  }
  // The ad comes first: during a pre-roll the language may not be known yet, and the time is not counted
  // either way
  if (reply.ad) {
    return { kind: "idle", text: "Ad, not counted" };
  }
  if (reply.inTarget === null) {
    return { kind: "idle", text: "Detecting the language…" };
  }
  if (!reply.inTarget) {
    return {
      kind: "off",
      // YouTube may play a dub in the viewer's language (see otherTrackInTarget in language.js)
      text: reply.otherTrack
        ? `Audio not in ${language}: pick the ${language} audio track in the player settings`
        : `Not ${language}, not counted`,
      action: { inTarget: true, label: `Mark as ${language}` },
    };
  }
  const counting = reply.immersion ? "Counting (immersion profile)" : `Counting ${language}`;
  return {
    kind: reply.playing ? "counting" : "idle",
    text: reply.playing ? counting : `${language} video, paused`,
    action: { inTarget: false, label: `Not ${language}?` },
  };
}

/** What the popup says about the reading counted by hand: its button, and the line under it. */
export function describeManual(session, nowSeconds) {
  if (!session) {
    return { running: false, label: "Count reading", text: "For comics and other reading with no video" };
  }
  const minutes = Math.max(0, Math.floor((nowSeconds - session.startedAt) / 60));
  return {
    running: true,
    label: "Stop reading",
    text: `Reading for ${minutes} min${session.title ? `: ${session.title}` : ""}`,
  };
}
