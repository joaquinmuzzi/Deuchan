import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { FILES, SIZES, renderIcon, renderPixels } from "../scripts/make-icons.mjs";
import {
  GERMAN_COLOR,
  IDLE_COLOR,
  PATTERN,
  iconCells,
  iconColor,
  iconShape,
  insideRoundedRect,
} from "../extension/src/icon.js";

const ICONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "extension", "icons");

test("the icon is orange for a German video", () => {
  assert.equal(iconColor(true), GERMAN_COLOR);
});

test("the icon is grey for a video that is not German, for an unknown language and for no video", () => {
  for (const german of [false, null, undefined]) {
    assert.equal(iconColor(german), IDLE_COLOR, String(german));
  }
});

test("the two colours are different, and orange is the one of the app", () => {
  assert.notEqual(GERMAN_COLOR, IDLE_COLOR);
  assert.equal(GERMAN_COLOR, "#e8590c");
});

test("the squares of the heatmap draw a D: a straight side, and the right corners cut", () => {
  assert.equal(PATTERN.length, 5);
  assert.ok(PATTERN.every((row) => row.length === 5));
  assert.ok(
    PATTERN.every((row) => row[0] === "X"),
    "the left side is straight",
  );
  assert.deepEqual(
    PATTERN.map((row) => row[4]),
    [".", "X", "X", "X", "."],
    "the right side is round",
  );
  assert.equal(PATTERN[0], "XXXX.");
  assert.equal(PATTERN[4], "XXXX.");
});

test("there are 25 squares, lit for the letter and faint for the rest, inside the icon at every size", () => {
  for (const size of SIZES) {
    const cells = iconCells(size);
    const shape = iconShape(size);
    assert.equal(cells.length, 25);
    assert.equal(
      cells.filter((cell) => cell.alpha === 1).length,
      PATTERN.join("").replaceAll(".", "").length,
    );
    assert.ok(cells.every((cell) => cell.alpha > 0 && cell.alpha <= 1));
    for (const cell of cells) {
      assert.ok(cell.x >= 0 && cell.y >= 0, `${size}: starts inside`);
      assert.ok(
        cell.x + cell.width <= shape.width && cell.y + cell.height <= shape.height,
        `${size}: ends inside`,
      );
    }
  }
});

test("the letter is centred in the icon", () => {
  for (const size of SIZES) {
    const cells = iconCells(size);
    const left = Math.min(...cells.map((cell) => cell.x));
    const right = Math.max(...cells.map((cell) => cell.x + cell.width));
    const top = Math.min(...cells.map((cell) => cell.y));
    const bottom = Math.max(...cells.map((cell) => cell.y + cell.height));
    assert.ok(Math.abs(left - (size - right)) < 1e-9, `${size}: horizontally`);
    assert.ok(Math.abs(top - (size - bottom)) < 1e-9, `${size}: vertically`);
  }
});

test("insideRoundedRect cuts the corners and nothing else", () => {
  const shape = { x: 0, y: 0, width: 48, height: 48, radius: 11 };
  assert.equal(insideRoundedRect(24, 24, shape), true);
  assert.equal(insideRoundedRect(0.5, 24, shape), true);
  assert.equal(insideRoundedRect(0.2, 0.2, shape), false);
  assert.equal(insideRoundedRect(47.8, 47.8, shape), false);
  assert.equal(insideRoundedRect(11, 0.5, shape), true);
  assert.equal(insideRoundedRect(-1, 24, shape), false);
});

test("the pixels have transparent corners, the colour of the icon and white squares", () => {
  const size = 128;
  const pixels = renderPixels(size, GERMAN_COLOR);
  const at = (x, y) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  assert.equal(at(0, 0)[3], 0, "the corner is transparent");
  const [first] = iconCells(size);
  const inside = at(Math.round(first.x + first.width / 2), Math.round(first.y + first.height / 2));
  assert.deepEqual(inside, [255, 255, 255, 255], "a lit square is white");
  const between = at(Math.round(first.x + first.width + 1), Math.round(first.y + first.height / 2));
  assert.deepEqual(between, [0xe8, 0x59, 0x0c, 255], "between squares it is the colour of the icon");
});

test("the PNG files are there for every size, in orange and in grey", () => {
  assert.equal(FILES.length, SIZES.length * 2);
  for (const { path, size } of FILES) {
    const png = readFileSync(resolve(ICONS, path));
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${path}: signature`,
    );
    assert.equal(png.readUInt32BE(16), size, `${path}: width`);
    assert.equal(png.readUInt32BE(20), size, `${path}: height`);
  }
});

test("the PNG files are what the code draws: run `npm run icons` after changing the shape", () => {
  for (const { path, size, color } of FILES) {
    const committed = readFileSync(resolve(ICONS, path));
    assert.ok(committed.equals(renderIcon(size, color)), `${path} is out of date`);
  }
});
