/**
 * What the popup says about the video of the current tab. `reply` is what the content script
 * answered, or `undefined` when there is no content script there (a page that is not YouTube, out of
 * the immersion profile, or a page with no video). `reply.immersion` is true in the immersion profile.
 *
 * `sound` is true when the tab plays sound that the immersion profile counts (see audio.js).
 *
 * `action` is the link to correct a wrong guess about the language: `german` is what pressing it
 * decides. There is none while the language is not known, or when there is no video.
 */
export function describeStatus(reply, sound = false) {
  if (!reply) {
    return sound
      ? { kind: "counting", text: "Counting sound (immersion profile)" }
      : { kind: "idle", text: "No video here" };
  }
  if (reply.german === null) {
    return { kind: "idle", text: "Detecting the language…" };
  }
  if (!reply.german) {
    return {
      kind: "off",
      text: "Not German, not counted",
      action: { german: true, label: "Mark as German" },
    };
  }
  const counting = reply.immersion ? "Counting (immersion profile)" : "Counting German";
  return {
    kind: reply.playing ? "counting" : "idle",
    text: reply.playing ? counting : "German video, paused",
    action: { german: false, label: "Not German?" },
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
