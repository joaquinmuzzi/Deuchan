// The panel of the dashboard to send the time per day and item to Kechimochi, and the CSV export in its
// format (in the settings). The panel shows what is in the storage (the settings and the state of the last
// sending) and asks the background script to do things; the words come from kechimochi-status.js. The
// permission to reach Kechimochi is asked for here, because only a page the person clicked on can ask.
import {
  DEFAULT_KECHIMOCHI_URL,
  kechimochiOrigins,
  normalizeKechimochiUrl,
} from "../src/kechimochi-client.js";
import { activityCsv, csvFileName } from "../src/kechimochi-csv.js";
import { languageName } from "../src/kechimochi-map.js";
import { readKechimochiSettings } from "../src/kechimochi-runner.js";
import { describeKechimochi, kechimochiErrorText } from "../src/kechimochi-status.js";
import { dayKey, migrate } from "../src/log.js";
import { TARGET_KEY, targetOf } from "../src/target.js";

const byId = (id) => document.getElementById(id);

export function setUpKechimochiPanel() {
  const dialog = byId("kechimochiDialog");
  const toggle = byId("kechimochiEnabled");
  const input = byId("kechimochiUrl");
  let settings = readKechimochiSettings(undefined);
  let state = null;
  let busy = false;
  let refresh = null;

  const ask = (message) => chrome.runtime.sendMessage(message).catch(() => ({ error: "unknown" }));

  function show({ result = "", error = "" } = {}) {
    byId("kechimochiResult").textContent = result;
    byId("kechimochiError").textContent = error;
  }

  function render() {
    const described = describeKechimochi(settings, state ?? undefined, Date.now());
    const status = byId("kechimochiStatus");
    status.textContent = busy ? "Working…" : described.text;
    status.dataset.tone = busy ? "busy" : described.tone;
    toggle.checked = settings.enabled;
    toggle.disabled = busy;
    // The address is changed with it off: a new one may need a new permission
    input.disabled = busy || settings.enabled;
    byId("kechimochiTest").disabled = busy;
    byId("kechimochiSendNow").disabled = busy || !settings.enabled;
  }

  async function load({ resetAddress = false } = {}) {
    const stored = await chrome.storage.local.get(["kechimochiSettings", "kechimochiState"]);
    settings = readKechimochiSettings(stored.kechimochiSettings);
    state = stored.kechimochiState ?? null;
    if (resetAddress) {
      input.value = settings.url;
    }
    render();
  }

  /** Runs something that takes a while, with the controls off, and shows how it went. */
  async function work(task) {
    busy = true;
    show();
    render();
    try {
      show(await task());
    } finally {
      busy = false;
      await load();
    }
  }

  /** The address typed, and the permission for it, asked for at once: only while the click goes on. */
  function withPermission(then) {
    const url = normalizeKechimochiUrl(input.value || DEFAULT_KECHIMOCHI_URL);
    if (!url) {
      show({ error: kechimochiErrorText("invalid-url") });
      render();
      return;
    }
    chrome.permissions
      .request({ origins: kechimochiOrigins(url) })
      .catch(() => false)
      .then((granted) => {
        if (!granted) {
          show({ error: "Without your permission Inputly cannot reach Kechimochi." });
          render();
          return;
        }
        then(url);
      });
  }

  const sentText = (answer) => {
    const parts = [
      [answer?.created, "new"],
      [answer?.updated, "updated"],
      [answer?.removed, "removed"],
    ]
      .filter(([count]) => count > 0)
      .map(([count, word]) => `${count} ${word}`);
    return parts.length > 0 ? `Logs: ${parts.join(", ")}.` : "Nothing new to send.";
  };

  byId("kechimochi").addEventListener("click", async () => {
    show();
    await load({ resetAddress: true });
    dialog.showModal();
    refresh = setInterval(render, 30_000);
  });
  dialog.addEventListener("close", () => clearInterval(refresh));
  byId("kechimochiClose").addEventListener("click", () => dialog.close());

  toggle.addEventListener("change", () => {
    if (!toggle.checked) {
      work(async () => {
        await ask({ type: "kechimochi:disable" });
        return {};
      });
      return;
    }
    // It stays off until the background script says it is on
    toggle.checked = false;
    withPermission((url) =>
      work(async () => {
        const answer = await ask({ type: "kechimochi:enable", url });
        if (answer?.error && !answer.health) {
          return { error: kechimochiErrorText(answer.error) };
        }
        if (!answer?.health?.ok) {
          return { error: kechimochiErrorText(answer?.health?.error) };
        }
        return answer.error
          ? { error: kechimochiErrorText(answer.error) }
          : { result: `Connected to Kechimochi. ${sentText(answer)}` };
      }),
    );
  });
  input.addEventListener("input", () => show());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      byId("kechimochiTest").click();
    }
  });

  byId("kechimochiTest").addEventListener("click", () =>
    withPermission((url) =>
      work(async () => {
        const answer = await ask({ type: "kechimochi:test", url });
        return answer?.ok
          ? { result: `Connected to Kechimochi (API ${answer.version.replace(/^http-/, "")}).` }
          : { error: kechimochiErrorText(answer?.error) };
      }),
    ),
  );

  byId("kechimochiSendNow").addEventListener("click", () =>
    work(async () => {
      const answer = await ask({ type: "kechimochi:send-now" });
      return answer?.error ? { error: kechimochiErrorText(answer.error) } : { result: sentText(answer) };
    }),
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.kechimochiSettings || changes.kechimochiState) {
      load();
    }
  });

  // The CSV export, in the settings: for everyone, with no permission, as a file the browser saves
  byId("exportCsv").addEventListener("click", async () => {
    const stored = await chrome.storage.local.get(["log", "videos", TARGET_KEY]);
    const text = activityCsv(migrate(stored.log), stored.videos, languageName(targetOf(stored[TARGET_KEY])));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    link.download = csvFileName(dayKey(new Date()));
    document.body.append(link);
    link.click();
    link.remove();
    // Freed once the browser surely has the file (Firefox reads it after the click has returned)
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  });
}
