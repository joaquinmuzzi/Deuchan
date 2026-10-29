// The panel of the dashboard to turn sync on and off. It shows what is in the storage (the key and the
// state of the last round) and asks the background script to do things; the words come from
// sync-status.js. Nothing here talks to the server.
import { describeSync, errorText } from "../src/sync-status.js";

const byId = (id) => document.getElementById(id);
const MASKED = "••••-••••-••••-••••-••••-••••-••••-••••";

export function setUpSyncPanel() {
  const dialog = byId("syncDialog");
  let key = null;
  let state = null;
  let revealed = false;
  let busy = false;
  // The buttons that ask twice, and the one that was asked once
  let confirming = null;
  let refresh = null;

  const ask = (message) => chrome.runtime.sendMessage(message).catch(() => ({ error: "unknown" }));

  function showError(kind) {
    byId("syncError").textContent = kind ? errorText(kind) : "";
  }

  function render() {
    const described = describeSync({ hasKey: Boolean(key) }, state ?? undefined, Date.now());
    const status = byId("syncStatus");
    status.textContent = busy ? "Working…" : described.text;
    status.dataset.tone = busy ? "busy" : described.tone;
    // The words are for everybody; what exactly happened is a hint for who has to find out why
    status.title = state?.status === "error" ? (state.detail ?? "") : "";

    byId("syncOff").hidden = Boolean(key);
    byId("syncOn").hidden = !key;
    byId("syncKeyText").textContent = key && revealed ? key : MASKED;
    byId("syncReveal").textContent = revealed ? "Hide" : "Show";
    byId("syncDisable").textContent = confirming === "disable" ? "Sure? Click again" : "Turn off";
    byId("syncErase").textContent = confirming === "erase" ? "Sure? Click again" : "Delete synced data";
    // What deleting does and does not do is said before the second click, not after
    byId("syncEraseNote").hidden = confirming !== "erase";
    for (const id of ["syncCreate", "syncJoin", "syncNow", "syncDisable", "syncErase"]) {
      byId(id).disabled = busy;
    }
  }

  async function load() {
    const stored = await chrome.storage.local.get(["syncKey", "syncState"]);
    key = stored.syncKey ?? null;
    state = stored.syncState ?? null;
    render();
  }

  /** Runs something that takes a while, with the buttons off, and shows how it went. */
  async function work(task) {
    busy = true;
    showError(null);
    render();
    try {
      const result = await task();
      showError(result?.error);
      return result;
    } finally {
      busy = false;
      confirming = null;
      await load();
    }
  }

  byId("sync").addEventListener("click", async () => {
    revealed = false;
    confirming = null;
    showError(null);
    await load();
    dialog.showModal();
    // "2 min ago" goes on counting while the panel is open
    refresh = setInterval(render, 30_000);
  });
  dialog.addEventListener("close", () => clearInterval(refresh));
  byId("syncClose").addEventListener("click", () => dialog.close());

  byId("syncCreate").addEventListener("click", () => work(() => ask({ type: "sync:create" })));

  byId("syncJoin").addEventListener("click", () => {
    const text = byId("syncJoinInput").value;
    return work(async () => {
      const result = await ask({ type: "sync:join", key: text });
      if (!result?.error) {
        byId("syncJoinInput").value = "";
      }
      return result;
    });
  });
  byId("syncJoinInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      byId("syncJoin").click();
    }
  });
  byId("syncJoinInput").addEventListener("input", () => showError(null));

  byId("syncNow").addEventListener("click", () => work(() => ask({ type: "sync:now" })));

  byId("syncReveal").addEventListener("click", () => {
    revealed = !revealed;
    render();
  });
  byId("syncCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(key);
      byId("syncCopy").textContent = "Copied";
      setTimeout(() => {
        byId("syncCopy").textContent = "Copy";
      }, 1500);
    } catch {
      // The clipboard can be refused; the key is there to be shown and copied by hand
      revealed = true;
      render();
    }
  });

  // Turning off and deleting need a second click: they are not things to do by mistake
  for (const [id, type, name] of [
    ["syncDisable", "sync:disable", "disable"],
    ["syncErase", "sync:erase", "erase"],
  ]) {
    byId(id).addEventListener("click", () => {
      if (confirming !== name) {
        confirming = name;
        render();
        return;
      }
      work(() => ask({ type }));
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.syncKey || changes.syncState) {
      load();
    }
  });
}
