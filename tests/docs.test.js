// Checks on the Markdown files: mistakes no reader should see and links that lead nowhere.
import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = ["*.md", "docs/**/*.md", ".github/**/*.md"]
  .flatMap((pattern) => globSync(pattern, { cwd: ROOT, exclude: (name) => name === "node_modules" }))
  .sort();

const stripCode = (text) => text.replace(/^```.*?^```/gms, "");

/** The text a reader sees as text: without code blocks, inline code or HTML comments. */
const prose = (text) =>
  stripCode(text)
    .replace(/<!--.*?-->/gs, "")
    .replace(/`[^`\n]*`/g, "");

/** GitHub's anchor for a heading: lower case, punctuation removed, spaces as hyphens. */
const anchor = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}_\- ]/gu, "")
    .replaceAll(" ", "-");

const anchors = (path) =>
  new Set([...stripCode(readFileSync(path, "utf8")).matchAll(/^#+ (.+)$/gm)].map((m) => anchor(m[1])));

const links = (text) =>
  [...text.matchAll(/\]\(([^)\s]+)\)/g), ...text.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((target) => !/^[a-z]+:/.test(target)); // http:, https:, mailto:...

test("there are Markdown files to check", () => {
  assert.ok(DOCS.length > 0);
});

for (const file of DOCS) {
  const path = resolve(ROOT, file);
  const text = readFileSync(path, "utf8");

  test(`${file}: no escape sequences in text`, () => {
    // A "\n" typed by an editing tool instead of a line break shows up as text on GitHub
    const found = prose(text).match(/.{0,30}\\[nt](?![A-Za-z]).{0,10}/g) ?? [];
    assert.deepEqual(found, [], "literal escape sequences");
  });

  test(`${file}: relative links lead somewhere`, () => {
    const broken = links(prose(text)).filter((target) => {
      const [name, heading] = target.split("#");
      const linked = name ? resolve(dirname(path), name) : path;
      // (the heading is only looked for once the file is known to exist)
      return !existsSync(linked) || (heading && linked.endsWith(".md") && !anchors(linked).has(heading));
    });
    assert.deepEqual(broken, [], `links to missing files or headings in ${relative(ROOT, path)}`);
  });
}
