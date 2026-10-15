import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEncryptedFileStorage } from "../../src/infrastructure/storage/encryptedFileStorage";
import { VAULT_STORAGE_KEY } from "../../src/infrastructure/storage/vault";

// Synthetic ciphertext only. AES authentication is covered by vault tests;
// this harness checks the physical publication protocol across process death.
export const processCiphertext = (revision: number) =>
  JSON.stringify({
    format: "lad-aes-gcm",
    version: 1,
    keyId: `synthetic-key-${revision}`,
    sealed: Buffer.from(`synthetic revision ${revision};`.repeat(600)).toString(
      "base64",
    ),
  });

async function main() {
  const [directory, operation, target] = process.argv.slice(2);
  assert.ok(directory && operation && target);
  process.on("message", () => undefined);
  let armed = false;
  const send = (event: object) => process.send?.(event);
  async function checkpoint(stage: string) {
    if (!armed || stage !== target) return;
    send({ type: "checkpoint", stage });
    await new Promise<void>(() => undefined);
  }
  const digest = async (value: string) =>
    createHash("sha256").update(value).digest("hex");
  function storage(profile: "personal" | "demo") {
    const folder = join(directory, profile);
    const pointerPath = join(folder, "pointer.json");
    return createEncryptedFileStorage({
      profile,
      randomId: randomUUID,
      sha256: digest,
      metadata: {
        async getItem() {
          try {
            return await readFile(pointerPath, "utf8");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
          }
        },
        async setItem(_key, value) {
          await checkpoint("before-pointer");
          // This TEST metadata adapter models an atomic small-row publication.
          // Node rename is not a test of SQLite, Expo IO or physical power loss.
          const temporary = `${pointerPath}.pending`;
          await writeFile(temporary, value, { mode: 0o600 });
          await rename(temporary, pointerPath);
          await checkpoint("after-pointer");
        },
        async removeItem() {
          await rm(pointerPath, { force: true });
        },
      },
      files: {
        async writeNew(name, value) {
          const handle = await open(join(folder, name), "wx", 0o600);
          try {
            const middle = Math.floor(value.length / 2);
            await handle.writeFile(value.slice(0, middle));
            await checkpoint("partial-generation");
            await handle.writeFile(value.slice(middle));
          } finally {
            await handle.close();
          }
        },
        async read(name, expectedBytes) {
          const path = join(folder, name);
          assert.equal((await stat(path)).size, expectedBytes);
          return readFile(path, "utf8");
        },
        async remove(name) {
          await rm(join(folder, name));
        },
      },
    });
  }
  for (const profile of ["personal", "demo"] as const)
    await mkdir(join(directory, profile), { recursive: true });
  if (operation === "load") {
    for (const profile of ["personal", "demo"] as const) {
      const value = await storage(profile).getItem(VAULT_STORAGE_KEY);
      assert.ok(value);
      send({ type: "loaded", profile, digest: await digest(value) });
    }
  } else {
    assert.ok(operation === "migrate-inline" || operation === "save-file");
    await storage("demo").setItem(VAULT_STORAGE_KEY, processCiphertext(0));
    const selected = storage("personal");
    if (operation === "migrate-inline")
      await writeFile(
        join(directory, "personal", "pointer.json"),
        processCiphertext(0),
      );
    else await selected.setItem(VAULT_STORAGE_KEY, processCiphertext(0));
    armed = true;
    await selected.setItem(VAULT_STORAGE_KEY, processCiphertext(1));
    send({ type: "ack", revision: 1 });
    await checkpoint("after-ack");
  }
  process.disconnect?.();
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
    process.disconnect?.();
  });
