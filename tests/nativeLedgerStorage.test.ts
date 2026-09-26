import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { encodeBackup } from "../src/domain/backup";
import { createInitialState } from "../src/domain/seed";
import {
  createVault,
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
} from "../src/infrastructure/storage/vault";

const filename = new URL(
  "../src/infrastructure/storage/ledgerStorage.native.ts",
  import.meta.url,
);
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename.pathname,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function fixture() {
  const items = new Map<string, string>();
  const secrets = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return items.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      items.set(key, value);
    },
    async removeItem(key: string) {
      items.delete(key);
    },
  };
  const modules: Record<string, unknown> = {
    "@react-native-async-storage/async-storage": storage,
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key: string) => secrets.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        secrets.delete(key);
      },
    },
    "expo-crypto": {
      randomUUID,
      AESKeySize: { AES256: 256 },
      AESEncryptionKey: {
        async generate(size: number) {
          assert.equal(size, 256);
          const key = randomBytes(32);
          return { encoded: async () => key.toString("hex") };
        },
        import: async (secret: string) => Buffer.from(secret, "hex"),
      },
      AESSealedData: {
        fromCombined(input: Uint8Array) {
          // SDK 57 Android's native signature accepts ByteArray, even though
          // the public JS types also advertise base64 strings. Preserve that
          // boundary here; accepting strings would hide the device-only bug.
          assert.ok(
            input instanceof Uint8Array,
            "Android AESSealedData.fromCombined requires Uint8Array",
          );
          return Buffer.from(input);
        },
      },
      async aesEncryptAsync(
        plain: Uint8Array,
        key: Buffer,
        options: { additionalData: Uint8Array },
      ) {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(options.additionalData);
        const bytes = Buffer.concat([
          iv,
          cipher.update(plain),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
        return { combined: async () => bytes.toString("base64") };
      },
      async aesDecryptAsync(
        sealed: Buffer,
        key: Buffer,
        options: { additionalData: Uint8Array },
      ) {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          sealed.subarray(0, 12),
        );
        decipher.setAAD(options.additionalData);
        decipher.setAuthTag(sealed.subarray(-16));
        return Buffer.concat([
          decipher.update(sealed.subarray(12, -16)),
          decipher.final(),
        ]);
      },
    },
    "./vault": { createVault },
  };
  const restart = () => {
    const exports = {} as { ledgerStorage: ReturnType<typeof createVault> };
    // Execute the actual native adapter with isolated platform modules and
    // real AES-GCM. This checks its wiring without loading React Native in Node.
    runInNewContext(
      source,
      {
        exports,
        require: (name: string) => {
          assert.ok(name in modules, `Unexpected native import: ${name}`);
          return modules[name];
        },
        TextEncoder,
        TextDecoder,
        Uint8Array,
        atob,
      },
      { filename: filename.pathname },
    );
    return exports.ledgerStorage;
  };
  const state = createInitialState(false, "2026-09-26");
  state.settings.name = "Проверка сохранения 🔐";
  return { items, secrets, restart, state };
}

test("native adapter saves a base64 envelope and reopens Unicode data after restart", async () => {
  const { items, restart, state } = fixture();
  const ledger = restart();
  await ledger.save(state);
  const first = items.get(VAULT_STORAGE_KEY)!;
  assert.equal(first.includes(state.settings.name), false);
  assert.deepEqual(await restart().load(), state);
  await ledger.save(state);
  assert.notEqual(items.get(VAULT_STORAGE_KEY), first);
  assert.deepEqual(await restart().load(), state);
});

test("native adapter verifies legacy migration before deleting plaintext", async () => {
  const { items, restart, state } = fixture();
  items.set(LEGACY_STORAGE_KEY, encodeBackup(state));
  assert.deepEqual(await restart().load(), state);
  assert.equal(items.has(LEGACY_STORAGE_KEY), false);
  assert.ok(items.has(VAULT_STORAGE_KEY));
  assert.deepEqual(await restart().load(), state);
});

test("native adapter rejects a changed authentication tag without overwriting the envelope", async () => {
  const { items, restart, state } = fixture();
  await restart().save(state);
  const payload = JSON.parse(items.get(VAULT_STORAGE_KEY)!);
  const bytes = Buffer.from(payload.sealed, "base64");
  bytes[bytes.length - 1] ^= 1;
  payload.sealed = bytes.toString("base64");
  const damaged = JSON.stringify(payload);
  items.set(VAULT_STORAGE_KEY, damaged);
  await assert.rejects(restart().load());
  await assert.rejects(restart().save(state));
  assert.equal(items.get(VAULT_STORAGE_KEY), damaged);
});
