/**
 * What the popup says about the video of the current tab. `reply` is what the content script
 * answered, or `undefined` when there is no content script there (any page that is not YouTube).
 *
 * `action` is the button to correct a wrong guess about the language: `german` is what pressing it
 * decides. There is none while the language is not known, or when there is no video.
 */
export function describeStatus(reply) {
  if (!reply) {
    return { kind: "idle", text: "Not on YouTube" };
  }
  if (reply.german === null) {
    return { kind: "idle", text: "Detecting the language…" };
  }
  if (!reply.german) {
    return {
      kind: "off",
      text: "Not German, not counted",
      hint: "Use the button below to override",
      action: { german: true, label: "Mark as German" },
    };
  }
  return {
    kind: reply.playing ? "counting" : "idle",
    text: reply.playing ? "Counting German" : "German video, paused",
    action: { german: false, label: "Mark as not German" },
  };
}
