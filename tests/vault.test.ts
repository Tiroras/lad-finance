import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  createVault,
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  type VaultDependencies,
} from "../src/security/vault";
import { createInitialState } from "../src/domain/seed";
import { encodeBackup } from "../src/domain/backup";

function fixture() {
  const items = new Map<string, string>(),
    secrets = new Map<string, string>();
  const dependencies: VaultDependencies = {
    storage: {
      async getItem(key) {
        return items.get(key) ?? null;
      },
      async setItem(key, value) {
        items.set(key, value);
      },
      async removeItem(key) {
        items.delete(key);
      },
    },
    keys: {
      async get(id) {
        return secrets.get(id) ?? null;
      },
      async create() {
        const id = randomUUID(),
          secret = randomBytes(32).toString("hex");
        secrets.set(id, secret);
        return { id, secret };
      },
      async remove(id) {
        secrets.delete(id);
      },
    },
    cipher: {
      async seal(plain, secret, context) {
        const iv = randomBytes(12),
          cipher = createCipheriv(
            "aes-256-gcm",
            Buffer.from(secret, "hex"),
            iv,
          );
        cipher.setAAD(Buffer.from(context));
        return Buffer.concat([
          iv,
          cipher.update(plain, "utf8"),
          cipher.final(),
          cipher.getAuthTag(),
        ]).toString("base64");
      },
      async open(sealed, secret, context) {
        const bytes = Buffer.from(sealed, "base64"),
          decipher = createDecipheriv(
            "aes-256-gcm",
            Buffer.from(secret, "hex"),
            bytes.subarray(0, 12),
          );
        decipher.setAAD(Buffer.from(context));
        decipher.setAuthTag(bytes.subarray(-16));
        return Buffer.concat([
          decipher.update(bytes.subarray(12, -16)),
          decipher.final(),
        ]).toString("utf8");
      },
    },
  };
  const state = createInitialState(false);
  state.settings.name = "Тимур 🔐";
  return {
    dependencies,
    items,
    secrets,
    state,
    vault: createVault(dependencies),
  };
}
test("legacy migration verifies encrypted data before removing plaintext, and reopens after restart", async () => {
  const { dependencies, vault, state, items, secrets } = fixture();
  items.set(LEGACY_STORAGE_KEY, encodeBackup(state));
  assert.deepEqual(await vault.load(), state);
  assert.equal(items.has(LEGACY_STORAGE_KEY), false);
  const encrypted = items.get(VAULT_STORAGE_KEY)!;
  assert.equal(encrypted.includes("Тимур"), false);
  assert.equal(
    [...secrets.values()].some((secret) => encrypted.includes(secret)),
    false,
  );
  assert.deepEqual(await createVault(dependencies).load(), state);
});
test("each save uses a fresh nonce; Unicode is preserved", async () => {
  const { vault, state, items, dependencies } = fixture();
  await vault.save(state);
  const first = items.get(VAULT_STORAGE_KEY);
  await vault.save(state);
  assert.notEqual(items.get(VAULT_STORAGE_KEY), first);
  assert.deepEqual(await createVault(dependencies).load(), state);
});
test("failed migration keeps plaintext, and failed ordinary saves keep the previous ciphertext", async () => {
  const { vault, state, items, dependencies } = fixture();
  items.set(LEGACY_STORAGE_KEY, encodeBackup(state));
  const original = dependencies.storage.setItem;
  dependencies.storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(vault.load(), /disk full/);
  assert.equal(items.get(LEGACY_STORAGE_KEY), encodeBackup(state));
  assert.equal(items.has(VAULT_STORAGE_KEY), false);
  dependencies.storage.setItem = original;
  await vault.load();
  const previous = items.get(VAULT_STORAGE_KEY);
  dependencies.storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    vault.save({
      ...state,
      settings: { ...state.settings, name: "Новое имя" },
    }),
  );
  assert.equal(items.get(VAULT_STORAGE_KEY), previous);
});
test("authentication tag damage and missing keys fail closed without falling back or overwriting", async () => {
  const { vault, state, items, secrets, dependencies } = fixture();
  await vault.save(state);
  const original = items.get(VAULT_STORAGE_KEY)!;
  const payload = JSON.parse(original),
    bytes = Buffer.from(payload.sealed, "base64");
  bytes[15] ^= 1;
  payload.sealed = bytes.toString("base64");
  const damaged = JSON.stringify(payload);
  items.set(VAULT_STORAGE_KEY, damaged);
  items.set(LEGACY_STORAGE_KEY, encodeBackup(state));
  await assert.rejects(createVault(dependencies).load());
  assert.equal(items.get(VAULT_STORAGE_KEY), damaged);
  assert.equal(items.has(LEGACY_STORAGE_KEY), true);
  items.set(VAULT_STORAGE_KEY, original);
  secrets.clear();
  await assert.rejects(createVault(dependencies).load(), /Ключ устройства/);
  await assert.rejects(
    createVault(dependencies).save(state),
    /Ключ устройства/,
  );
  assert.equal(items.get(VAULT_STORAGE_KEY), original);
});
test("explicit recovery rotates the key and preserves the previous vault when its commit fails", async () => {
  const { vault, state, items, dependencies, secrets } = fixture();
  await vault.save(state);
  const previous = items.get(VAULT_STORAGE_KEY)!;
  const oldKey = JSON.parse(previous).keyId,
    original = dependencies.storage.setItem;
  dependencies.storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(vault.recover(state));
  assert.equal(items.get(VAULT_STORAGE_KEY), previous);
  assert.ok(secrets.has(oldKey));
  dependencies.storage.setItem = original;
  const recovered = {
    ...state,
    settings: { ...state.settings, name: "Восстановлено" },
  };
  await vault.recover(recovered);
  assert.notEqual(JSON.parse(items.get(VAULT_STORAGE_KEY)!).keyId, oldKey);
  assert.equal(secrets.has(oldKey), false);
  assert.deepEqual(await createVault(dependencies).load(), recovered);
});
test("a corrupt legacy snapshot never creates an encrypted replacement", async () => {
  const { items, vault, secrets } = fixture();
  items.set(LEGACY_STORAGE_KEY, "broken-json");
  await assert.rejects(vault.load());
  assert.equal(items.get(LEGACY_STORAGE_KEY), "broken-json");
  assert.equal(items.has(VAULT_STORAGE_KEY), false);
  assert.equal(secrets.size, 0);
});
