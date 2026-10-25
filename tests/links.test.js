import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

const KOFI = "https://ko-fi.com/muzzijoaquin";

for (const page of ["extension/popup/popup.html", "extension/dashboard/dashboard.html"]) {
  test(`${page} links to Ko-fi in a new tab, without giving it access to the extension`, () => {
    const anchor = read(page).match(/<a\s[^>]*class="support"[^>]*>/s)?.[0];
    assert.ok(anchor, "there is a support link");
    assert.match(anchor, new RegExp(`href="${KOFI}"`));
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer"/);
  });
}

test("every external link of the pages is to Ko-fi: nothing else is loaded or linked from them", () => {
  for (const page of ["extension/popup/popup.html", "extension/dashboard/dashboard.html"]) {
    const urls = read(page).match(/https?:\/\/[^"'\s)]+/g) ?? [];
    assert.deepEqual([...new Set(urls)], [KOFI], page);
  }
});

test("the README links to Ko-fi too", () => {
  assert.ok(read("README.md").includes(KOFI));
});
