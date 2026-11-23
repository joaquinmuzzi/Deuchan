// The demo data of the store screenshots: what `chrome.storage.local` would hold for someone who learns
// Japanese and has used Inputly for about seven months. Every title and address is invented. The data is
// the same on every run (a seeded random generator and a fixed "now"), so the images can be made again.
import { dayKey, daysBefore } from "../../extension/src/log.js";

/** The moment the screenshots pretend to be taken at: a Friday evening, in the local time zone. */
export const DEMO_NOW = new Date(2026, 10, 20, 21, 40).getTime();

/** The day opened in the "day detail" screenshot: yesterday. */
export const OPENED_DAY = dayKey(daysBefore(new Date(DEMO_NOW), 1));

export const GOAL_MINUTES = 45;

/** Days from the first one with time to today. */
const HISTORY_DAYS = 214;

/** The last days in a row with time: the streak. */
const STREAK_DAYS = 26;

/** Today, a bit short of the goal, so the popup shows what is left. */
const TODAY_SECONDS = 38 * 60 + 12;

const TITLES = [
  "【簡単レシピ】15分で作れる親子丼",
  "東京の朝さんぽ Vlog｜下町の商店街",
  "ゆる日本語ポッドキャスト #48 子どもの頃の夏休み",
  "初めてのキャンプで大失敗した話",
  "京都の古い本屋さんを巡る一日",
  "【ゲーム実況】のんびり島づくり Part 12",
  "雨の日のカフェで作業する Vlog",
  "猫と暮らす一人暮らしのルーティン",
  "北海道ひとり旅 3日目｜朝市と温泉",
  "やさしい日本語ニュース 11月第3週",
  "【雑談】最近ハマっている本の話",
  "日本の高校生の一日に密着してみた",
];

/** The day that is opened in a screenshot, with a video that is not in Japanese to correct. */
const OPENED_ITEMS = [
  { id: "q7Lk2mVx9aE", title: "北海道ひとり旅 3日目｜朝市と温泉", seconds: 24 * 60 + 31 },
  { id: "Tz4nR8wPc1Y", title: "日本語ポッドキャスト #48 夏休みの話", seconds: 17 * 60 + 5 },
  { id: "Gm0sH3kQd6U", title: "Grammar in English: the て-form", seconds: 9 * 60 + 48 },
  {
    id: "web:k3n9x2p7",
    title: "漫画: ねこ商店街の毎日 1巻",
    seconds: 12 * 60 + 40,
    url: "https://example.com/manga/neko-shoutengai/1",
    kind: "reading",
  },
];

/** mulberry32: a small seeded generator, enough for demo data. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The seconds of a day, `ago` days before today: a habit that grows, with longer weekends. */
function daySeconds(next, ago, weekday) {
  if (ago === 0) {
    return TODAY_SECONDS;
  }
  const progress = 1 - ago / HISTORY_DAYS;
  // Early on, days are often skipped; the streak at the end has none
  if (ago >= STREAK_DAYS && next() < 0.35 - progress * 0.25) {
    return 0;
  }
  const weekend = weekday === 0 || weekday === 6 ? 1.6 : 1;
  const minutes = (14 + progress * 34) * weekend * (0.45 + next() * 1.1);
  return Math.round(Math.max(minutes, 6) * 60 + next() * 59);
}

/** The videos of a day: the time split among a few of the titles. */
function dayItems(next, seconds) {
  const count = 1 + Math.floor(next() * Math.min(4, seconds / 600));
  const shares = Array.from({ length: count }, () => 0.3 + next());
  const sum = shares.reduce((total, share) => total + share, 0);
  const items = {};
  let left = seconds;
  shares.forEach((share, index) => {
    const id = Array.from({ length: 11 }, () => ID_CHARACTERS[Math.floor(next() * 64)]).join("");
    const part = index === count - 1 ? left : Math.round((seconds * share) / sum);
    left -= part;
    items[id] = { title: TITLES[Math.floor(next() * TITLES.length)], seconds: part };
  });
  return items;
}

/** Everything the pages read from `chrome.storage.local`. */
export function demoStorage({ theme = "dark" } = {}) {
  const next = random(343);
  const now = new Date(DEMO_NOW);
  const days = {};
  const videos = {};
  for (let ago = HISTORY_DAYS - 1; ago >= 0; ago -= 1) {
    const date = daysBefore(now, ago);
    const key = dayKey(date);
    const seconds =
      key === OPENED_DAY
        ? OPENED_ITEMS.reduce((total, item) => total + item.seconds, 0)
        : daySeconds(next, ago, date.getDay());
    if (seconds === 0) {
      continue;
    }
    days[key] = seconds;
    // Only the last 60 days keep their videos, as the extension does
    if (ago < 60) {
      videos[key] =
        key === OPENED_DAY
          ? Object.fromEntries(OPENED_ITEMS.map(({ id, ...item }) => [id, item]))
          : dayItems(next, seconds);
    }
  }
  return {
    log: { version: 1, days },
    videos,
    goalMinutes: GOAL_MINUTES,
    targetLanguage: "ja",
    range: 30,
    theme,
  };
}
