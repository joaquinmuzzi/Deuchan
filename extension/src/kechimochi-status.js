/** What the Kechimochi panel says, worked out from the settings and the state: no DOM here, so it can be tested. */
import { timeAgo } from "./mosaik-status.js";

const ERRORS = {
  "not-running":
    "Kechimochi does not answer. Open it and turn on its HTTP API (profile tab); what is counted waits until then.",
  "not-kechimochi": "Something else answers at that address, not Kechimochi's HTTP API.",
  forbidden:
    "Kechimochi refused the address. From another computer, turn on LAN mode in its HTTP API advanced settings.",
  "permission-missing":
    "Inputly needs your permission to reach Kechimochi. Turn it off and on again to allow it.",
  "invalid-url":
    "Use the address of Kechimochi's HTTP API on this computer (like http://127.0.0.1:3031) or on your home network (like http://192.168.1.50:3031).",
  server: "Kechimochi had a problem. It will try again.",
  "invalid-answer": "Kechimochi's answer was not understood. It will try again.",
  "bad-request": "Kechimochi did not take a log.",
  conflict: "Kechimochi did not take a media entry.",
  "not-found": "Kechimochi did not find a media entry or a log.",
  off: "Turn it on first.",
};

/** A sending that started this long ago and never ended is not running: the extension was stopped. */
const STALE_MS = 2 * 60_000;

/** The text for an error, from a sending, a test or the panel. */
export function kechimochiErrorText(kind) {
  if (ERRORS[kind]) {
    return ERRORS[kind];
  }
  if (/^http-\d+$/.test(kind ?? "")) {
    return `Kechimochi answered with an error (${kind.slice(5)}).`;
  }
  return "It did not work. It will try again.";
}

/**
 * @param {{ enabled: boolean }} settings
 * @param {{ status?: string, lastSentAt?: number, lastError?: string|null, startedAt?: number }} state
 * @returns {{ tone: "off" | "ok" | "busy" | "warn", text: string }}
 */
export function describeKechimochi(settings, state, now) {
  if (!settings.enabled) {
    return { tone: "off", text: "Off" };
  }
  const status = state?.status;
  if (status === "sending" && now - (state.startedAt ?? 0) < STALE_MS) {
    return { tone: "busy", text: "Sending…" };
  }
  if (["bad-request", "conflict", "not-found"].includes(status)) {
    const detail = state.lastError ? `: ${state.lastError}` : "";
    return { tone: "warn", text: `${kechimochiErrorText(status)}${detail}` };
  }
  if (status && !["ok", "waiting", "sending", "off"].includes(status)) {
    return { tone: "warn", text: kechimochiErrorText(status) };
  }
  if (status === "ok" && state.lastError) {
    return { tone: "warn", text: `Connected, but Kechimochi refused a log: ${state.lastError}` };
  }
  if (state?.lastSentAt) {
    return { tone: "ok", text: `Connected · sent ${timeAgo(state.lastSentAt, now)}` };
  }
  if (status === "ok") {
    return { tone: "ok", text: "Connected · nothing new to send" };
  }
  return { tone: "busy", text: "Waiting to send…" };
}
