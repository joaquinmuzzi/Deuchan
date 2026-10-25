// Draws the icon of Deuchan into the PNG files of the manifest, with the same shape the toolbar icon
// has (extension/src/icon.js): `npm run icons`. No dependency: the PNG is written by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

import { GERMAN_COLOR, IDLE_COLOR, iconCells, iconShape, insideRoundedRect } from "../extension/src/icon.js";

export const SIZES = [16, 32, 48, 128];

/** How many samples per side are taken inside each pixel, to smooth the edges. */
const SAMPLES = 4;

const rgb = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

/** The icon as RGBA pixels, `size` x `size`, with transparent corners. */
export function renderPixels(size, color) {
  const base = rgb(color);
  const shape = iconShape(size);
  const cells = iconCells(size);
  const pixels = Buffer.alloc(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let covered = 0;
      const sum = [0, 0, 0];
      for (let sampleRow = 0; sampleRow < SAMPLES; sampleRow += 1) {
        for (let sampleColumn = 0; sampleColumn < SAMPLES; sampleColumn += 1) {
          const x = column + (sampleColumn + 0.5) / SAMPLES;
          const y = row + (sampleRow + 0.5) / SAMPLES;
          if (!insideRoundedRect(x, y, shape)) {
            continue;
          }
          const cell = cells.find((candidate) => insideRoundedRect(x, y, candidate));
          const alpha = cell?.alpha ?? 0;
          covered += 1;
          for (let channel = 0; channel < 3; channel += 1) {
            sum[channel] += base[channel] * (1 - alpha) + 255 * alpha;
          }
        }
      }
      const offset = (row * size + column) * 4;
      if (covered > 0) {
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[offset + channel] = Math.round(sum[channel] / covered);
        }
        pixels[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** The icon as the bytes of a PNG file. */
export function renderIcon(size, color) {
  const pixels = renderPixels(size, color);
  // Every line of the image starts with a filter byte; 0 is "none"
  const lines = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row += 1) {
    pixels.copy(lines, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(lines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The files of the icons: the app's orange one, and the grey one the toolbar starts with. */
export const FILES = SIZES.flatMap((size) => [
  { path: `icon-${size}.png`, size, color: GERMAN_COLOR },
  { path: `idle-${size}.png`, size, color: IDLE_COLOR },
]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const folder = resolve(dirname(fileURLToPath(import.meta.url)), "..", "extension", "icons");
  mkdirSync(folder, { recursive: true });
  for (const { path, size, color } of FILES) {
    writeFileSync(resolve(folder, path), renderIcon(size, color));
  }
  console.log(`Wrote ${FILES.length} icons to ${folder}`);
}
