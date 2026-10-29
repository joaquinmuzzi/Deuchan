/** What the sync panel says, worked out from the settings and the state: no DOM here, so it can be tested. */

/** How long ago, in words: `just now`, `5 min ago`, `3 h ago`, `2 days ago`. */
export function timeAgo(then, now) {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const ERRORS = {
  network: "Could not reach the server. It will try again soon.",
  "rate-limited": "Too many requests. It will try again later.",
  auth: "The server did not accept the key.",
  full: "The server is full. Your time is safe on this computer.",
  "too-large": "The data is too big to sync.",
  corrupt: "The synced data cannot be read.",
  conflict: "Two computers synced at once. It will try again soon.",
  server: "The server has a problem. It will try again soon.",
  "no-data": "No data was found for that key. Check it.",
  "invalid-key": "That is not a sync key. It has 32 letters and digits.",
};

/** A syncing that started this long ago and never ended is not running: the extension was stopped. */
const STALE_MS = 2 * 60_000;

/**
 * @param {{ hasKey: boolean }} settings
 * @param {{ status?: string, lastSync?: number|null, devices?: number, error?: string|null, startedAt?: number }} state
 * @returns {{ tone: "off" | "ok" | "busy" | "warn", text: string }}
 */
export function describeSync(settings, state, now) {
  if (!settings.hasKey) {
    return { tone: "off", text: "Sync is off" };
  }
  if (state?.status === "syncing" && now - (state.startedAt ?? 0) < STALE_MS) {
    return { tone: "busy", text: "Syncing…" };
  }
  if (state?.status === "error") {
    return { tone: "warn", text: ERRORS[state.error] ?? "Sync failed. It will try again soon." };
  }
  if (state?.lastSync) {
    const devices = state.devices ?? 1;
    return {
      tone: "ok",
      text: `Synced ${timeAgo(state.lastSync, now)} · ${devices} ${devices === 1 ? "device" : "devices"}`,
    };
  }
  return { tone: "busy", text: "Waiting to sync…" };
}

/** The text for an error of the sync, whether it comes from a round or from the panel. */
export const errorText = (kind) => ERRORS[kind] ?? "Sync failed.";
