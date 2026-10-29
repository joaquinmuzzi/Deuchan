import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { EXTENSION, buildPackage, collectFiles } from "../scripts/package.mjs";
import { crc32, createZip } from "../scripts/zip.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A reader of zip files that does not share anything with the writer: it reads the central directory. */
function readZip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "it has an end of central directory");
  const count = bytes.readUInt16LE(end + 10);
  let position = bytes.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(position), 0x02014b50, "a central directory entry");
    const flags = bytes.readUInt16LE(position + 8);
    const method = bytes.readUInt16LE(position + 10);
    const crc = bytes.readUInt32LE(position + 16);
    const packedSize = bytes.readUInt32LE(position + 20);
    const size = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    const extraLength = bytes.readUInt16LE(position + 30);
    const commentLength = bytes.readUInt16LE(position + 32);
    const localOffset = bytes.readUInt32LE(position + 42);
    const name = bytes.subarray(position + 46, position + 46 + nameLength).toString("utf8");

    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50, "a local header");
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const packed = bytes.subarray(start, start + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : packed;
    entries.push({ name, data, crc, size, flags });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("what goes into a zip comes out of it, whatever the files are", () => {
  const files = [
    { name: "manifest.json", data: Buffer.from('{"a": 1}') },
    { name: "empty.txt", data: Buffer.alloc(0) },
    { name: "src/ñandú ✓.js", data: Buffer.from("export const x = 1;\n".repeat(500)) },
    { name: "icons/binary.bin", data: Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7919) % 256)) },
  ];
  const entries = readZip(createZip(files));
  assert.deepEqual(
    entries.map((entry) => entry.name),
    files.map((file) => file.name),
  );
  for (const [index, entry] of entries.entries()) {
    assert.ok(entry.data.equals(files[index].data), entry.name);
    assert.equal(entry.size, files[index].data.length, entry.name);
    assert.equal(entry.crc, crc32(files[index].data), entry.name);
    assert.equal(entry.flags & 0x0800, 0x0800, "names are marked as UTF-8");
  }
});

test("a zip with no files is still a zip", () => {
  assert.deepEqual(readZip(createZip([])), []);
});

test("the same files always give the same bytes", () => {
  const files = [
    { name: "a.txt", data: Buffer.from("one") },
    { name: "b/c.txt", data: Buffer.from("two") },
  ];
  assert.ok(createZip(files).equals(createZip(files)));
});

test("the package has the manifest at the root and every file of the extension, and nothing else", () => {
  const { name, files, bytes } = buildPackage();
  const entries = readZip(bytes);
  const names = entries.map((entry) => entry.name);
  assert.deepEqual(names, files);
  assert.ok(names.includes("manifest.json"), "the manifest is at the root, not inside a folder");
  assert.deepEqual(names, [...names].sort(), "in order");
  assert.deepEqual(names, collectFiles(EXTENSION));
  for (const entry of entries) {
    assert.ok(
      entry.data.equals(readFileSync(join(EXTENSION, entry.name))),
      `${entry.name} is the file of the extension`,
    );
  }
  const { version } = JSON.parse(readFileSync(join(EXTENSION, "manifest.json"), "utf8"));
  assert.equal(name, `deuchan-${version}.zip`);
});

test("nothing that is not part of the extension is in the package", () => {
  const names = buildPackage().files;
  for (const name of names) {
    assert.ok(!name.startsWith("../") && !name.startsWith("/") && !name.includes("\\"), name);
    assert.ok(!/(^|\/)\./.test(name), `no hidden file: ${name}`);
    assert.ok(!/\.(test|spec)\.|\.map$|\.zip$/.test(name), `no test, map or zip: ${name}`);
    assert.ok(!/^(tests|server|scripts|docs|node_modules|dist)\//.test(name), name);
  }
});

test("every file the manifest names is in the package", () => {
  const names = new Set(buildPackage().files);
  const manifest = JSON.parse(readFileSync(join(EXTENSION, "manifest.json"), "utf8"));
  const needed = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((script) => script.js),
    ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const file of needed) {
    assert.ok(names.has(file), file);
  }
  // and what the pages load: the dashboard and the popup
  for (const file of [
    "dashboard/dashboard.html",
    "dashboard/dashboard.js",
    "popup/popup.js",
    "src/theme.css",
  ]) {
    assert.ok(names.has(file), file);
  }
});

test("the package is small, and the store limits on the manifest are respected", () => {
  const { bytes } = buildPackage();
  assert.ok(bytes.length < 1_000_000, `${bytes.length} bytes`);
  const manifest = JSON.parse(readFileSync(join(ROOT, "extension", "manifest.json"), "utf8"));
  assert.ok(manifest.name.length <= 75, "the name");
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 132, "the summary");
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
});
