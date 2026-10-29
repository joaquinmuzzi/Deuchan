/**
 * The sync key, and what is made from it.
 *
 * The person gets one sync key (32 letters and digits in groups of four, which can be read out or
 * typed on another computer). Two things are made from it, and they cannot be turned into each other:
 *
 * - the **token**, which is sent to the server to prove that the key is known. The server keeps the
 *   data under the hash of the token;
 * - the **encryption key**, which never leaves the extension. The data is encrypted with it (AES-GCM)
 *   before it is sent, so the server can neither read it nor change it without being noticed.
 *
 * Both come from the sync key with HKDF, with a different label for each. The key has 160 bits, so it
 * cannot be guessed. Everything uses the Web Crypto of the browser, with no library.
 */

/** Crockford's base32: no I, L, O or U, so that a key is not misread when it is typed. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const KEY_BYTES = 20;
const KEY_CHARS = 32;

const encoder = new TextEncoder();
const SALT = encoder.encode("deuchan-sync-v1");
/** Binds every block to this use: a block made for something else does not decrypt as ours. */
const CONTEXT = encoder.encode("deuchan-sync-v1");

export class SyncCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyncCryptoError";
  }
}

export function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new SyncCryptoError("not base64url");
  }
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function toBase32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

function fromBase32(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of text) {
    value = (value << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

/** A new random sync key, as the text the person sees: `ABCD-EFGH-…` (eight groups of four). */
export function newSyncKey() {
  const text = toBase32(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
  return text.match(/.{4}/g).join("-");
}

/**
 * What a person typed as a sync key, as its bytes, or `null` if it is not one. Case, spaces and
 * dashes do not matter, and the letters that look like digits are read as digits (O as 0, I and L as 1).
 */
export function parseSyncKey(text) {
  if (typeof text !== "string") {
    return null;
  }
  const clean = text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replaceAll("O", "0")
    .replaceAll("I", "1")
    .replaceAll("L", "1");
  if (clean.length !== KEY_CHARS || [...clean].some((character) => !ALPHABET.includes(character))) {
    return null;
  }
  return fromBase32(clean);
}

/** The key as it is shown, whatever way it was written. */
export const formatSyncKey = (text) => {
  const bytes = parseSyncKey(text);
  return bytes ? toBase32(bytes).match(/.{4}/g).join("-") : null;
};

/** The token for the server and the encryption key, made from the bytes of a sync key. */
export async function deriveKeys(keyBytes) {
  const material = await crypto.subtle.importKey("raw", keyBytes, "HKDF", false, ["deriveBits", "deriveKey"]);
  const parameters = (label) => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(label) });
  const token = toBase64Url(
    new Uint8Array(await crypto.subtle.deriveBits(parameters("token"), material, 256)),
  );
  const key = await crypto.subtle.deriveKey(
    parameters("encryption"),
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { token, key };
}

/** Encrypts any JSON value into the block the server stores: `{ v: 1, iv, data }`. */
export async function encrypt(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: CONTEXT },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { v: 1, iv: toBase64Url(iv), data: toBase64Url(new Uint8Array(data)) };
}

/** What a block holds, or a `SyncCryptoError` if it is not ours or was changed (a wrong key too). */
export async function decrypt(key, block) {
  try {
    if (block?.v !== 1) {
      throw new SyncCryptoError("unknown version");
    }
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(block.iv), additionalData: CONTEXT },
      key,
      fromBase64Url(block.data),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new SyncCryptoError("the block cannot be decrypted");
  }
}
