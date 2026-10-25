import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

const PAGES = ["extension/popup/popup.html", "extension/dashboard/dashboard.html"];

const AUTHOR = "https://github.com/joaquinmuzzi";
const REPOSITORY = "https://github.com/joaquinmuzzi/deuchan";
const KOFI = "https://ko-fi.com/muzzijoaquin";

/** The `<a>` tags of the footer of a page. */
const footerLinks = (page) => {
  const footer = read(page).match(/<footer class="footer">([\s\S]*?)<\/footer>/)?.[1] ?? "";
  return footer.match(/<a\s[^>]*>/g) ?? [];
};

for (const page of PAGES) {
  test(`${page}: the footer links to the author, the repository and Ko-fi, in that order`, () => {
    const hrefs = footerLinks(page).map((anchor) => anchor.match(/href="([^"]+)"/)?.[1]);
    assert.deepEqual(hrefs, [AUTHOR, REPOSITORY, KOFI]);
  });

  test(`${page}: the footer links open in a new tab, without giving access to the extension`, () => {
    for (const anchor of footerLinks(page)) {
      assert.match(anchor, /target="_blank"/);
      assert.match(anchor, /rel="noopener noreferrer"/);
    }
  });

  test(`${page}: those are the only addresses it links to or loads from`, () => {
    const urls = read(page).match(/https?:\/\/[^"'\s)]+/g) ?? [];
    assert.deepEqual([...new Set(urls)].sort(), [AUTHOR, REPOSITORY, KOFI].sort());
  });
}

test("the README links to the repository and to Ko-fi", () => {
  const readme = read("README.md");
  assert.ok(readme.includes(REPOSITORY));
  assert.ok(readme.includes(KOFI));
});
