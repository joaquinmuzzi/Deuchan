import assert from "node:assert/strict";
import { test } from "node:test";

import {
  KEY_BYTES,
  SyncCryptoError,
  decrypt,
  deriveKeys,
  encrypt,
  formatSyncKey,
  fromBase64Url,
  newSyncKey,
  parseSyncKey,
  toBase64Url,
} from "../extension/src/sync-crypto.js";

test("a new key is 32 letters and digits in eight groups of four, and different every time", () => {
  const key = newSyncKey();
  assert.match(key, /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.notEqual(newSyncKey(), key);
});

test("a key can be parsed back to its bytes, whatever the case, spaces and dashes", () => {
  const key = newSyncKey();
  const bytes = parseSyncKey(key);
  assert.equal(bytes.length, KEY_BYTES);
  assert.deepEqual(parseSyncKey(key.toLowerCase()), bytes);
  assert.deepEqual(parseSyncKey(key.replaceAll("-", " ")), bytes);
  assert.deepEqual(parseSyncKey(`  ${key.replaceAll("-", "")}\n`), bytes);
});

test("the letters that look like digits are read as digits", () => {
  const bytes = parseSyncKey("0000-0000-0000-0000-0000-0000-0000-0001");
  assert.deepEqual(parseSyncKey("OOOO-oooo-0000-0000-0000-0000-0000-000I"), bytes);
  assert.deepEqual(parseSyncKey("0000-0000-0000-0000-0000-0000-0000-000l"), bytes);
});

test("what is not a key is not parsed", () => {
  const key = newSyncKey();
  for (const bad of [
    "",
    "ABCD",
    key.slice(0, -1),
    `${key}A`,
    key.replace(/.$/, "U"),
    key.replace(/.$/, "!"),
    null,
    undefined,
    12345,
  ]) {
    assert.equal(parseSyncKey(bad), null, String(bad));
  }
});

test("formatSyncKey shows a key the standard way, or nothing", () => {
  const key = newSyncKey();
  assert.equal(formatSyncKey(key.toLowerCase().replaceAll("-", "")), key);
  assert.equal(formatSyncKey("nope"), null);
});

test("the same key always gives the same token, and a different key gives another", async () => {
  const bytes = parseSyncKey(newSyncKey());
  const first = await deriveKeys(bytes);
  const second = await deriveKeys(bytes);
  const other = await deriveKeys(parseSyncKey(newSyncKey()));
  assert.equal(first.token, second.token);
  assert.notEqual(first.token, other.token);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
});

test("the token is not the key and does not reveal it", async () => {
  const text = newSyncKey();
  const { token } = await deriveKeys(parseSyncKey(text));
  assert.ok(!token.includes(text.replaceAll("-", "")));
  assert.ok(!text.replaceAll("-", "").includes(token));
});

test("the encryption key cannot be taken out of the extension", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  await assert.rejects(() => crypto.subtle.exportKey("raw", key));
});

test("what is encrypted is decrypted, whatever it is, and the block has the shape the server wants", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  const value = { version: 1, devices: { a: { days: { "2026-10-24": 3600 } } }, text: "ñandú ✓" };
  const block = await encrypt(key, value);
  assert.deepEqual(Object.keys(block).sort(), ["data", "iv", "v"]);
  assert.equal(block.v, 1);
  assert.match(block.iv, /^[A-Za-z0-9_-]+$/);
  assert.match(block.data, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decrypt(key, block), value);
});

test("the block does not contain what was encrypted", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  const block = await encrypt(key, { secret: "2026-10-24" });
  const raw = new TextDecoder().decode(fromBase64Url(block.data));
  assert.ok(!JSON.stringify(block).includes("2026-10-24"));
  assert.ok(!raw.includes("2026-10-24"));
});

test("the same value gives a different block every time", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  const first = await encrypt(key, { a: 1 });
  const second = await encrypt(key, { a: 1 });
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
});

test("a wrong key cannot decrypt", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  const { key: other } = await deriveKeys(parseSyncKey(newSyncKey()));
  const block = await encrypt(key, { a: 1 });
  await assert.rejects(() => decrypt(other, block), SyncCryptoError);
});

test("a block that was changed is refused, in the data or in the iv", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  const block = await encrypt(key, { a: 1 });
  const bytes = fromBase64Url(block.data);
  bytes[0] ^= 1;
  await assert.rejects(() => decrypt(key, { ...block, data: toBase64Url(bytes) }), SyncCryptoError);
  const iv = fromBase64Url(block.iv);
  iv[0] ^= 1;
  await assert.rejects(() => decrypt(key, { ...block, iv: toBase64Url(iv) }), SyncCryptoError);
});

test("blocks that are not blocks are refused with the same error", async () => {
  const { key } = await deriveKeys(parseSyncKey(newSyncKey()));
  for (const bad of [
    null,
    undefined,
    {},
    { v: 2, iv: "AAAA", data: "AAAA" },
    { v: 1, iv: "!!", data: "AAAA" },
    "x",
  ]) {
    await assert.rejects(() => decrypt(key, bad), SyncCryptoError, JSON.stringify(bad));
  }
});

test("base64url goes and comes back for any bytes, and rejects what it is not", () => {
  for (const length of [0, 1, 2, 3, 4, 5, 31, 32, 255]) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    assert.deepEqual(fromBase64Url(toBase64Url(bytes)), bytes, String(length));
  }
  assert.throws(() => fromBase64Url("a+b"), SyncCryptoError);
  assert.throws(() => fromBase64Url("abcde"), SyncCryptoError);
  assert.throws(() => fromBase64Url(5), SyncCryptoError);
});
