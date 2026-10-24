/**
 * What the popup says about the video of the current tab. `reply` is what the content script
 * answered, or `undefined` when there is no content script there (any page that is not YouTube).
 */
export function describeStatus(reply) {
  if (!reply) {
    return { kind: "idle", text: "Not on YouTube" };
  }
  if (reply.german === null) {
    return { kind: "idle", text: "Detecting the language…" };
  }
  if (!reply.german) {
    return { kind: "off", text: "Not German, not counted" };
  }
  return reply.playing
    ? { kind: "counting", text: "Counting German" }
    : { kind: "idle", text: "German video, paused" };
}
