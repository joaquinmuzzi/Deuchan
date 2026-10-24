// The only place that writes the log, so that several YouTube tabs cannot overwrite each other:
// every update waits for the one before it.
import { addSeconds, dayKey, migrate } from "./log.js";

let queue = Promise.resolve();

async function save(seconds) {
  const { log } = await chrome.storage.local.get("log");
  await chrome.storage.local.set({ log: addSeconds(migrate(log), dayKey(new Date()), seconds) });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  // Only the content script of this extension, in a YouTube tab, can add time
  if (sender.id !== chrome.runtime.id || message?.type !== "watched" || !(message.seconds > 0)) {
    return;
  }
  queue = queue.then(() => save(message.seconds)).catch(() => {});
});
