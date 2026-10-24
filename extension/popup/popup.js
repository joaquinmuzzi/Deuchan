import { migrate } from "../src/log.js";
import { summarize } from "../src/summary.js";

const byId = (id) => document.getElementById(id);

function render(log) {
  const summary = summarize(migrate(log), new Date());
  byId("today").textContent = summary.today;
  byId("week").textContent = summary.week;
  byId("month").textContent = summary.month;
  byId("total").textContent = summary.total;
  byId("streak").textContent = String(summary.streak);
  byId("bars").replaceChildren(
    ...summary.bars.map(({ day, label, height }) => {
      const bar = document.createElement("div");
      bar.className = height > 0 ? "bar has-time" : "bar";
      bar.style.height = `${Math.round(height * 100)}%`;
      bar.title = `${day}: ${label}`;
      return bar;
    }),
  );
}

const { log } = await chrome.storage.local.get("log");
render(log);

// The popup can stay open while a video plays
chrome.storage.onChanged.addListener((changes) => changes.log && render(changes.log.newValue));
