/** What the Mosaik panel says, worked out from the settings and the state: no DOM here, so it can be tested. */
import { timeAgo } from "./sync-status.js";

const ERRORS = {
  "not-running": "Mosaik is not running. Events wait here and go when it is.",
  "not-mosaik": "Something else answers at that address, not Mosaik.",
  outdated: "Mosaik does not take data yet. Update Mosaik.",
  "permission-missing":
    "Deuchan needs your permission to reach Mosaik. Turn it off and on again to allow it.",
  "invalid-url": "Use an address on this computer, like http://127.0.0.1:7300.",
  "too-large": "Mosaik refused an event as too large.",
  server: "Mosaik had a problem. It will try again.",
  "invalid-answer": "Mosaik's answer was not understood. It will try again.",
  off: "Turn it on first.",
};

/** A sending that started this long ago and never ended is not running: the extension was stopped. */
const STALE_MS = 2 * 60_000;

/** The text for an error, from a sending, a test or the panel. */
export function mosaikErrorText(kind) {
  if (ERRORS[kind]) {
    return ERRORS[kind];
  }
  if (/^http-\d+$/.test(kind ?? "")) {
    return `Mosaik answered with an error (${kind.slice(5)}).`;
  }
  return "It did not work. It will try again.";
}

/**
 * @param {{ enabled: boolean }} settings
 * @param {{ status?: string, lastSentAt?: number, lastError?: string|null, startedAt?: number }} state
 * @returns {{ tone: "off" | "ok" | "busy" | "warn", text: string }}
 */
export function describeMosaik(settings, state, now) {
  if (!settings.enabled) {
    return { tone: "off", text: "Off" };
  }
  const status = state?.status;
  if (status === "sending" && now - (state.startedAt ?? 0) < STALE_MS) {
    return { tone: "busy", text: "Sending…" };
  }
  if (status === "forbidden") {
    return { tone: "warn", text: `Mosaik refused the data: ${state.lastError ?? "forbidden"}` };
  }
  if (status === "bad-request") {
    return { tone: "warn", text: `Mosaik did not take the data: ${state.lastError ?? "bad request"}` };
  }
  if (["not-running", "outdated", "permission-missing"].includes(status)) {
    return { tone: "warn", text: mosaikErrorText(status) };
  }
  if (status === "error") {
    return { tone: "warn", text: mosaikErrorText(state.lastError) };
  }
  if (state?.lastSentAt) {
    return { tone: "ok", text: `Sent ${timeAgo(state.lastSentAt, now)}` };
  }
  return { tone: "busy", text: "Waiting to send…" };
}

/** The numbers under the status: what waits, what was refused, what was dropped. */
export function describeQueue(pending, state) {
  const parts = [`${pending} ${pending === 1 ? "event" : "events"} waiting`];
  if (state?.rejected > 0) {
    parts.push(`${state.rejected} refused`);
  }
  if (state?.dropped > 0) {
    parts.push(`${state.dropped} dropped (the queue was full)`);
  }
  return parts.join(" · ");
}
