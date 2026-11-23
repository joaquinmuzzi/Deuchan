import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The landing page in site/, published on GitHub Pages (task 3.1 of the plan)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const SITE_URL = "https://joaquinmuzzi.github.io/Inputly/";
const page = readFileSync(join(SITE, "index.html"), "utf8");
const css = readFileSync(join(SITE, "style.css"), "utf8");

const tags = (name) => page.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Every address the page loads by itself: images, stylesheets, icons, scripts, frames, media. */
const loaded = () => [
  ...tags("img").map((tag) => attribute(tag, "src")),
  ...tags("link").map((tag) => attribute(tag, "href")),
  ...["script", "iframe", "source", "video", "audio", "embed", "object"].flatMap((name) =>
    tags(name).map((tag) => attribute(tag, "src") ?? attribute(tag, "data") ?? attribute(tag, "srcset")),
  ),
  ...[...css.matchAll(/url\(\s*["']?([^"')]+)/g)].map((match) => match[1]),
  ...[...css.matchAll(/@import\s+["']([^"']+)/g)].map((match) => match[1]),
];

test("site: the page loads nothing from another host, and runs no script", () => {
  assert.deepEqual(tags("script"), []);
  for (const address of loaded()) {
    // The canonical link names the page's own address; it is not loaded
    if (address === SITE_URL) {
      continue;
    }
    assert.doesNotMatch(address, /^(https?:)?\/\//, `${address} comes from another host`);
  }
});

test("site: every local link and image leads to a file of site/", () => {
  const local = [...loaded(), ...tags("a").map((tag) => attribute(tag, "href"))].filter(
    (address) => address && !/^(https?:|mailto:|#)/.test(address) && !address.startsWith("//"),
  );
  assert.ok(local.length > 0);
  for (const address of local) {
    assert.ok(existsSync(join(SITE, address.split(/[?#]/)[0])), `${address} is missing`);
  }
});

test("site: every in-page link leads to an id of the page", () => {
  for (const tag of tags("a")) {
    const href = attribute(tag, "href");
    if (href.startsWith("#")) {
      assert.ok(page.includes(`id="${href.slice(1)}"`), `${href} leads nowhere`);
    }
  }
});

test("site: every image has alt text, and a size so the page does not jump while it loads", () => {
  for (const tag of tags("img")) {
    assert.notEqual(attribute(tag, "alt"), undefined, `${tag} has no alt`);
    assert.ok(attribute(tag, "width") && attribute(tag, "height"), `${tag} has no width and height`);
  }
  // Only the brand icon, which sits beside the name, is decorative
  const decorative = tags("img").filter((tag) => attribute(tag, "alt") === "");
  assert.deepEqual(
    decorative.map((tag) => attribute(tag, "src")),
    ["img/icon-128.png"],
  );
});

test("site: the cards for other sites show the promo image of the site itself", () => {
  const image = `${SITE_URL}img/promo.jpg`;
  assert.ok(page.includes(`<meta property="og:image" content="${image}" />`));
  assert.ok(page.includes(`<meta name="twitter:image" content="${image}" />`));
  assert.ok(existsSync(join(SITE, "img/promo.jpg")));
});

test("site: it links to both stores, the source, the privacy policy and Ko-fi", () => {
  const hrefs = tags("a").map((tag) => attribute(tag, "href"));
  for (const href of [
    "https://chromewebstore.google.com/detail/imadljjebohcpkeopadcifnodmfbndel",
    "https://microsoftedge.microsoft.com/addons/detail/ofophfcnojdmdffnfljneagppnnjelpp",
    "https://github.com/joaquinmuzzi/Inputly#install-from-the-source",
    "https://github.com/joaquinmuzzi/Inputly/blob/main/PRIVACY.md",
    "https://ko-fi.com/muzzijoaquin",
  ]) {
    assert.ok(hrefs.includes(href), `no link to ${href}`);
  }
  // The README's heading that the Firefox button leads to
  assert.match(readFileSync(join(ROOT, "README.md"), "utf8"), /^## Install from the source$/m);
});

test("site: the page has one h1 and no heading level skipped", () => {
  const levels = [...page.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  assert.equal(levels.filter((level) => level === 1).length, 1);
  levels.reduce((previous, level) => {
    assert.ok(level <= previous + 1, `h${level} after h${previous}`);
    return level;
  }, 0);
});

test("site: the whole site stays light (under 400 KB)", () => {
  const size = (path) =>
    statSync(path).isDirectory()
      ? readdirSync(path).reduce((sum, name) => sum + size(join(path, name)), 0)
      : statSync(path).size;
  assert.ok(size(SITE) < 400 * 1024, `site/ is ${Math.round(size(SITE) / 1024)} KB`);
});

/** WCAG contrast ratio of two #rrggbb colours. */
const contrast = (one, two) => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((start) => {
      const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

/** The colour variables of each theme of style.css: the first block is light, the second dark. */
const themes = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(([, block]) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map(([, name, value]) => [name, value]),
  ),
);

test("site: text, links and buttons reach WCAG AA contrast in both themes", () => {
  assert.equal(themes.length, 2);
  for (const theme of themes) {
    for (const [fore, back] of [
      ["text", "bg"],
      ["text", "card"],
      ["muted", "bg"],
      ["muted", "card"],
      ["accent", "bg"],
      ["on-accent", "accent"],
    ]) {
      const ratio = contrast(theme[fore], theme[back]);
      assert.ok(ratio >= 4.5, `--${fore} on --${back} is ${ratio.toFixed(2)}:1`);
    }
    // Headings are large text, where 3:1 is enough
    assert.ok(contrast(theme.strong, theme.bg) >= 3);
  }
});
