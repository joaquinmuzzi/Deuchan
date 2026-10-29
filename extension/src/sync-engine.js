/**
 * One round of sync: read what the server has, put it together with what this device knows, and write
 * it back if there is something new. It is the same for the first time and for the thousandth, and it
 * can be repeated: the rule that puts the data together (`mergeDevices`) counts nothing twice.
 *
 * Two computers can sync at the same moment. The server only accepts a write that says which revision
 * it saw, so one of them gets a conflict and tries again from the start, now seeing the other's data.
 */
import { SyncError } from "./sync-client.js";
import { SyncCryptoError, decrypt, encrypt } from "./sync-crypto.js";
import { blobOf, mergeDevices, receive, sanitizeDevices } from "./sync-data.js";

/** How many times a round starts again after a conflict before it gives up until the next one. */
const ATTEMPTS = 3;

/** Whether two sets of devices have the same days with the same seconds. */
function sameDevices(first, second) {
  const normal = (devices) =>
    JSON.stringify(
      Object.entries(devices)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, device]) => [id, Object.entries(device.days).sort(([a], [b]) => a.localeCompare(b))]),
    );
  return normal(first) === normal(second);
}

/**
 * @param {object} options
 * @param {ReturnType<import("./sync-client.js").createClient>} options.client
 * @param {CryptoKey} options.key  the encryption key (see `deriveKeys`)
 * @param {string} options.deviceId  this device
 * @param {{ days: object }} options.log  what this device counted
 * @param {object} options.others  what it knew about the other devices
 * @param {boolean} [options.mustExist]  fail if the server has nothing, as when joining with a key typed
 *   by a person, which may be wrong: a wrong key must not silently start an empty copy
 * @returns {Promise<{ others: object, uploaded: boolean, devices: number }>}
 */
export async function syncOnce({ client, key, deviceId, log, others, mustExist = false }) {
  let known = others ?? {};
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const remote = await client.get();
    if (!remote && mustExist) {
      throw new SyncError("no-data", "the server has no data for this key");
    }

    let remoteDevices = {};
    if (remote) {
      let blob;
      try {
        blob = await decrypt(key, remote.block);
      } catch (error) {
        throw error instanceof SyncCryptoError
          ? new SyncError("corrupt", "the data on the server cannot be read")
          : error;
      }
      remoteDevices = sanitizeDevices(blob?.devices);
      known = receive(known, blob, deviceId);
    }

    const outgoing = blobOf(deviceId, log, known);
    const devices = Object.keys(outgoing.devices).length;
    // If the server already has everything this device has, there is nothing to write
    if (remote && sameDevices(mergeDevices(remoteDevices, outgoing.devices), remoteDevices)) {
      return { others: known, uploaded: false, devices };
    }

    const result = await client.put(await encrypt(key, outgoing), remote?.rev ?? 0);
    if (!result.conflict) {
      return { others: known, uploaded: true, devices };
    }
  }
  throw new SyncError("conflict", "the data kept changing while syncing");
}
