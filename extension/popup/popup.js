import { migrate } from "../src/log.js";
import { describeStatus } from "../src/status.js";
import { summarize } from "../src/summary.js";
import { setUpTheme } from "../src/theme.js";

const byId = (id) => document.getElementById(id);

function render(log) {
  const summary = summarize(migrate(log), new Date());
  byId("today").textContent = summary.today;
  byId("week").textContent = summary.week;
  byId("month").textContent = summary.month;
  byId("streak").textContent = String(summary.streak);
}

async function renderStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Pages without the content script do not answer, and sendMessage then fails
  const reply = tab
    ? await chrome.tabs.sendMessage(tab.id, { type: "status" }).catch(() => undefined)
    : undefined;
  const { kind, text } = describeStatus(reply);
  byId("status").textContent = text;
  byId("status").dataset.kind = kind;
}

byId("dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  window.close();
});

setUpTheme(byId("theme"));
const { log } = await chrome.storage.local.get("log");
render(log);
renderStatus();

// The popup can stay open while a video plays
chrome.storage.onChanged.addListener((changes) => changes.log && render(changes.log.newValue));
setInterval(renderStatus, 1000);
