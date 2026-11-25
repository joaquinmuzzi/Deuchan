import assert from "node:assert/strict";
import { test } from "node:test";

import {
  backupFileName,
  buildBackup,
  mergeBackup,
  parseBackup,
  replacePlan,
} from "../extension/src/backup.js";
import { STORAGE_VERSION } from "../extension/src/log.js";

const VIDEO = "dQw4w9WgXcQ";
const OTHER = "abcdefghijk";

const stored = {
  log: {
    version: 1,
    days: { "2026-11-01": 3600, "2026-11-03": 1800 },
    adjust: { "2026-11-03": { seconds: 600, at: 1 } },
  },
  videos: { "2026-11-01": { [VIDEO]: { title: "Ein Video", seconds: 3600 } } },
  goalMinutes: 45,
  targetLanguage: "ja",
  "overrides:ja": { [VIDEO]: true },
  covered: [{ from: 1, to: 2 }],
  manualSession: { startedAt: 1 },
  mosaikSettings: { enabled: true, token: "mkd_secretsecretsecretsecret" },
  immersion: { enabled: true },
  syncKey: "old",
};

const fileOf = (backup) => JSON.stringify(backup);

test("the file name carries the local date", () => {
  assert.equal(backupFileName(new Date(2026, 10, 5, 13)), "inputly-backup-2026-11-05.json");
});

test("an export keeps the history and the settings, and leaves out secrets and transient state", () => {
  const backup = buildBackup(stored, { version: "0.2.3", now: new Date("2026-11-25T10:00:00Z") });
  assert.equal(backup.app, "inputly");
  assert.equal(backup.version, "0.2.3");
  assert.equal(backup.storageVersion, STORAGE_VERSION);
  assert.equal(backup.exportedAt, "2026-11-25T10:00:00.000Z");
  assert.deepEqual(Object.keys(backup.data).sort(), [
    "goalMinutes",
    "log",
    "overrides:ja",
    "targetLanguage",
    "videos",
  ]);
  assert.ok(!JSON.stringify(backup).includes("mkd_"));
});

test("an export reads back to the same data, with a summary", () => {
  const result = parseBackup(fileOf(buildBackup(stored, { version: "0.2.3" })));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.log, stored.log);
  assert.deepEqual(result.data.videos, stored.videos);
  assert.deepEqual(result.summary, {
    days: 2,
    first: "2026-11-01",
    last: "2026-11-03",
    seconds: 3600 + 2400,
  });
});

test("files that are not an Inputly backup are refused", () => {
  assert.equal(parseBackup("not json").ok, false);
  assert.equal(
    parseBackup(JSON.stringify({ app: "other", storageVersion: 1, data: { log: { days: {} } } })).ok,
    false,
  );
  assert.equal(parseBackup(JSON.stringify({ app: "inputly", data: { log: { days: {} } } })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: "inputly", storageVersion: 1, data: {} })).ok, false);
  assert.equal(parseBackup(JSON.stringify([1])).ok, false);
});

test("a backup from a newer storage version is refused", () => {
  const backup = { app: "inputly", storageVersion: STORAGE_VERSION + 1, data: { log: { days: {} } } };
  assert.match(parseBackup(JSON.stringify(backup)).error, /newer/);
});

test("invalid values and unknown keys are dropped, the log is migrated", () => {
  const backup = {
    app: "inputly",
    storageVersion: 1,
    data: {
      log: { days: { "2026-11-01": 60, nope: 5, "2026-11-02": -3 } },
      videos: {
        "2026-11-01": { [VIDEO]: { title: "x", seconds: "a lot" }, [OTHER]: { title: "y", seconds: 5 } },
      },
      goalMinutes: 9999,
      theme: "pink",
      targetLanguage: "ja",
      overrides: { [VIDEO]: "yes", [OTHER]: false },
      mosaikSettings: { token: "mkd_x" },
      whatever: 1,
    },
  };
  const result = parseBackup(JSON.stringify(backup));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    log: { version: STORAGE_VERSION, days: { "2026-11-01": 60 } },
    videos: { "2026-11-01": { [OTHER]: { title: "y", seconds: 5 } } },
    targetLanguage: "ja",
    overrides: { [OTHER]: false },
  });
});

test("replace writes the backup and removes backup keys it does not have", () => {
  const imported = { log: { version: 1, days: { "2026-10-01": 60 } } };
  const plan = replacePlan(stored, imported);
  assert.deepEqual(plan.set, imported);
  assert.deepEqual(plan.remove.sort(), ["goalMinutes", "overrides:ja", "targetLanguage", "videos"]);
});

test("merge keeps the larger time per day, joins items and keeps the settings here", () => {
  const imported = {
    log: {
      version: 1,
      days: { "2026-11-01": 1200, "2026-10-30": 900 },
      adjust: { "2026-11-03": { seconds: -60, at: 2 } },
    },
    videos: {
      "2026-11-01": {
        [VIDEO]: { title: "Ein Video", seconds: 4000 },
        [OTHER]: { title: "Zwei", seconds: 100 },
      },
    },
    goalMinutes: 20,
    theme: "dark",
    "overrides:ja": { [VIDEO]: false, [OTHER]: true },
  };
  const { set, remove } = mergeBackup(stored, imported);
  assert.deepEqual(remove, []);
  assert.deepEqual(set.log.days, { "2026-11-01": 3600, "2026-11-03": 1800, "2026-10-30": 900 });
  // The correction made here wins
  assert.deepEqual(set.log.adjust, { "2026-11-03": { seconds: 600, at: 1 } });
  assert.deepEqual(set.videos["2026-11-01"], {
    [VIDEO]: { title: "Ein Video", seconds: 4000 },
    [OTHER]: { title: "Zwei", seconds: 100 },
  });
  assert.equal(set.goalMinutes, undefined);
  assert.equal(set.theme, "dark");
  assert.deepEqual(set["overrides:ja"], { [VIDEO]: true, [OTHER]: true });
});

test("merge into an empty install is the backup", () => {
  const imported = parseBackup(fileOf(buildBackup(stored, { version: "0.2.3" }))).data;
  const { set } = mergeBackup({}, imported);
  assert.deepEqual(set, imported);
});
