import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { encodeBackup } from "../../src/domain/backup";
import { createSaveQueue } from "../../src/state/finance/saveQueue";
import {
  createVault,
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
} from "../../src/infrastructure/storage/vault";
import {
  reliabilityCipher,
  reliabilityProfiles,
  reliabilitySnapshots,
  snapshotEvidence,
} from "./saveReliability";

const [directory, operation, target] = process.argv.slice(2);
assert.ok(directory && operation && target);
// Keep a process stopped at an awaited checkpoint alive until the parent kills it.
process.on("message", () => undefined);
const [profile, otherProfile] = reliabilityProfiles;
const snapshots = reliabilitySnapshots();
let armed = false;
const send = (event: object) =>
  process.send?.({ ...event, elapsedMs: performance.now() });
async function checkpoint(stage: string) {
  if (!armed) return;
  send({ type: "checkpoint", stage });
  if (stage === target) await new Promise<void>(() => undefined);
}
async function read(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function diskVault(selected: string) {
  const folder = join(directory, selected);
  const path = (key: string) => join(folder, key);
  return createVault({
    storage: {
      async getItem(key) {
        const value = await read(path(key));
        if (key === VAULT_STORAGE_KEY && committed)
          await checkpoint("envelope-readback");
        return value;
      },
      async setItem(key, value) {
        // This TEST adapter explicitly uses fsync + rename. Its atomicity is
        // not evidence about AsyncStorage or a physical device/power failure.
        const temporary = path(`${key}.pending`);
        const handle = await open(temporary, "w", 0o600);
        try {
          await handle.writeFile(value);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await checkpoint("envelope-before-commit");
        await rename(temporary, path(key));
        committed = true;
        await checkpoint("envelope-after-commit");
      },
      async removeItem(key) {
        if (key === LEGACY_STORAGE_KEY)
          await checkpoint("legacy-before-remove");
        await rm(path(key), { force: true });
        if (key === LEGACY_STORAGE_KEY) await checkpoint("legacy-after-remove");
      },
    },
    keys: {
      get: (id) => read(path(`key-${id}`)),
      async create() {
        await checkpoint("key-before-create");
        const id = randomUUID(),
          secret = randomBytes(32).toString("hex");
        await writeFile(path(`key-${id}`), secret, { mode: 0o600 });
        await checkpoint("key-after-create");
        return { id, secret };
      },
      async remove(id) {
        await checkpoint("old-key-before-remove");
        await rm(path(`key-${id}`), { force: true });
        await checkpoint("old-key-after-remove");
      },
    },
    cipher: reliabilityCipher,
  });
}
let committed = false;
async function main() {
  await mkdir(join(directory, profile), { recursive: true });
  await mkdir(join(directory, otherProfile), { recursive: true });

  if (operation === "load") {
    for (const selected of reliabilityProfiles) {
      const state = await diskVault(selected).load();
      assert.ok(state);
      send({ type: "loaded", profile: selected, ...snapshotEvidence(state) });
    }
  } else {
    const vault = diskVault(profile);
    await diskVault(otherProfile).save(snapshots[0]);
    if (operation === "migrate") {
      await writeFile(
        join(directory, profile, LEGACY_STORAGE_KEY),
        encodeBackup(snapshots[0]),
        { mode: 0o600 },
      );
    } else {
      await vault.save(snapshots[0]);
    }
    committed = false;
    // Acknowledgement ledger belongs to this harness, not FinanceProvider.
    // Revision identity AND destination are checked after the full vault path.
    const lastSaved = new Map([[profile, snapshots[0]]]);
    const queue = createSaveQueue<{ profile: string; revision: number }>(
      async (value) => {
        send({ type: "write-start", ...value });
        await vault.save(snapshots[value.revision]);
        lastSaved.set(profile, snapshots[value.revision]);
        send({ type: "write-complete", ...value });
      },
      (failed) => send({ type: "settled", failed }),
    );
    async function save(revision: number) {
      send({ type: "memory", profile, revision });
      await checkpoint("before-enqueue");
      queue.enqueue({ profile, revision });
      await queue.flush();
      assert.equal(lastSaved.get(profile), snapshots[revision]);
      send({ type: "ack", profile, revision });
      await checkpoint("after-ack");
    }
    if (operation === "two-edits") {
      await save(1);
      armed = true;
      await save(2);
    } else {
      armed = true;
      if (operation === "save") await save(1);
      else if (operation === "migrate") {
        assert.deepEqual(await vault.load(), snapshots[0]);
        send({ type: "ack", profile, revision: 0 });
        await checkpoint("after-ack");
      } else if (operation === "recover") {
        await vault.recover(snapshots[1]);
        send({ type: "ack", profile, revision: 1 });
        await checkpoint("after-ack");
      } else throw new Error(`Unknown operation ${operation}`);
    }
  }
  process.disconnect?.();
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  process.disconnect?.();
});
