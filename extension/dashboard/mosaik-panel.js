// The panel of the dashboard to send the watch time to Mosaik, a hub on this computer. It shows what is in
// the storage (the settings, the queue and the state of the last sending) and asks the background script
// to do things; the words come from mosaik-status.js. The permission to reach the hub is asked for here,
// because only a page the person clicked on can ask for it.
import { DEFAULT_HUB_URL, hubOrigins, normalizeHubUrl } from "../src/mosaik-client.js";
import { pendingCount, readOutbox } from "../src/mosaik-events.js";
import { readMosaikSettings } from "../src/mosaik-runner.js";
import { describeMosaik, describeQueue, mosaikErrorText } from "../src/mosaik-status.js";

const byId = (id) => document.getElementById(id);

export function setUpMosaikPanel() {
  const dialog = byId("mosaikDialog");
  const toggle = byId("mosaikEnabled");
  const input = byId("mosaikUrl");
  let settings = readMosaikSettings(undefined);
  let state = null;
  let outbox = readOutbox(undefined);
  let busy = false;
  let refresh = null;

  const ask = (message) => chrome.runtime.sendMessage(message).catch(() => ({ error: "unknown" }));

  function show({ result = "", error = "" } = {}) {
    byId("mosaikResult").textContent = result;
    byId("mosaikError").textContent = error;
  }

  function render() {
    const described = describeMosaik(settings, state ?? undefined, Date.now());
    const status = byId("mosaikStatus");
    status.textContent = busy ? "Working…" : described.text;
    status.dataset.tone = busy ? "busy" : described.tone;
    toggle.checked = settings.enabled;
    toggle.disabled = busy;
    // The address is changed with it off: a new one may need a new permission
    input.disabled = busy || settings.enabled;
    byId("mosaikQueue").textContent = settings.enabled ? describeQueue(pendingCount(outbox), state) : "";
    byId("mosaikTest").disabled = busy;
    for (const id of ["mosaikSendNow", "mosaikBackfill"]) {
      byId(id).disabled = busy || !settings.enabled;
    }
  }

  async function load({ resetAddress = false } = {}) {
    const stored = await chrome.storage.local.get(["mosaikSettings", "mosaikState", "mosaikOutbox"]);
    settings = readMosaikSettings(stored.mosaikSettings);
    state = stored.mosaikState ?? null;
    outbox = readOutbox(stored.mosaikOutbox);
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
      await load({ resetAddress: true });
    }
  }

  /**
   * The address typed, and the permission for it, asked for at once: the browser only shows the question
   * while the click is going on. `then` gets the address once the permission is there.
   */
  function withPermission(then) {
    const url = normalizeHubUrl(input.value || DEFAULT_HUB_URL);
    if (!url) {
      show({ error: mosaikErrorText("invalid-url") });
      render();
      return;
    }
    chrome.permissions
      .request({ origins: hubOrigins(url) })
      .catch(() => false)
      .then((granted) => {
        if (!granted) {
          show({ error: "Without your permission Deuchan cannot reach Mosaik." });
          render();
          return;
        }
        then(url);
      });
  }

  byId("mosaik").addEventListener("click", async () => {
    show();
    await load({ resetAddress: true });
    dialog.showModal();
    // "2 min ago" goes on counting while the panel is open
    refresh = setInterval(render, 30_000);
  });
  dialog.addEventListener("close", () => clearInterval(refresh));
  byId("mosaikClose").addEventListener("click", () => dialog.close());

  toggle.addEventListener("change", () => {
    if (!toggle.checked) {
      work(async () => {
        await ask({ type: "mosaik:disable" });
        return {};
      });
      return;
    }
    // It stays off until the background script says it is on
    toggle.checked = false;
    withPermission((url) =>
      work(async () => {
        const answer = await ask({ type: "mosaik:enable", url });
        if (answer?.error && !answer.health) {
          return { error: mosaikErrorText(answer.error) };
        }
        return { result: answer?.health?.ok ? `Connected to Mosaik ${answer.health.version}`.trim() : "" };
      }),
    );
  });
  input.addEventListener("input", () => show());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      byId("mosaikTest").click();
    }
  });

  byId("mosaikTest").addEventListener("click", () =>
    withPermission((url) =>
      work(async () => {
        const answer = await ask({ type: "mosaik:test", url });
        return answer?.ok
          ? { result: `Connected to Mosaik ${answer.version}`.trim() }
          : { error: mosaikErrorText(answer?.error) };
      }),
    ),
  );

  byId("mosaikSendNow").addEventListener("click", () =>
    work(async () => {
      const answer = await ask({ type: "mosaik:send-now" });
      if (answer?.error) {
        return { error: mosaikErrorText(answer.error) };
      }
      return { result: `${answer?.sent ?? 0} ${answer?.sent === 1 ? "event" : "events"} sent` };
    }),
  );

  byId("mosaikBackfill").addEventListener("click", () =>
    work(async () => {
      const answer = await ask({ type: "mosaik:backfill" });
      if (answer?.error && !answer.queued) {
        return { error: mosaikErrorText(answer.error) };
      }
      const days = `${answer.queued} ${answer.queued === 1 ? "day" : "days"}`;
      return answer.error
        ? { result: `The history (${days}) waits to be sent.`, error: mosaikErrorText(answer.error) }
        : { result: `History sent: ${days}.` };
    }),
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.mosaikSettings || changes.mosaikState || changes.mosaikOutbox) {
      load();
    }
  });
}
