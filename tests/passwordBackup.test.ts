import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { backupCrypto } from "../src/services/backupCrypto";
import { derivePasswordKey } from "../src/security/passwordKdf";
import {
  BACKUP_ITERATIONS,
  decryptBackup,
  encryptBackup,
  parsePasswordEnvelope,
  type BackupCrypto,
} from "../src/security/passwordBackup";

const password = "Секретная фраза 🔑 2026";
const nodeCrypto: BackupCrypto = {
  random: (length) => new Uint8Array(randomBytes(length)),
  async derive(value, salt, iterations) {
    return new Uint8Array(pbkdf2Sync(value, salt, iterations, 32, "sha256"));
  },
  async seal(plain, key, nonce, aad) {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad);
    return new Uint8Array(
      Buffer.concat([
        nonce,
        cipher.update(plain),
        cipher.final(),
        cipher.getAuthTag(),
      ]),
    );
  },
  async open(sealed, key, aad) {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      sealed.subarray(0, 12),
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(sealed.subarray(-16));
    return new Uint8Array(
      Buffer.concat([
        decipher.update(sealed.subarray(12, -16)),
        decipher.final(),
      ]),
    );
  },
};
function fixture() {
  const state = createInitialState(true, "2026-09-10");
  state.settings.name = "Личные данные 🔐";
  state.scenarios = [
    {
      id: "test",
      name: "Купить мебель",
      horizon: 60,
      changes: [],
      events: [
        {
          id: "chair",
          name: "Стол",
          amount: 150000,
          type: "expense",
          date: "2026-09-20",
        },
      ],
    },
  ];
  return state;
}
test("password backup round-trips between independent WebCrypto and Node adapters, includes scenarios and uses fresh salt/nonce", async () => {
  const state = fixture();
  const first = await encryptBackup(state, password, backupCrypto);
  const second = await encryptBackup(state, password, nodeCrypto);
  assert.notEqual(first, second);
  assert.equal(first.includes(state.settings.name), false);
  assert.equal(first.includes(password), false);
  assert.notEqual(JSON.parse(first).salt, JSON.parse(second).salt);
  assert.notEqual(
    JSON.parse(first).sealed.slice(0, 24),
    JSON.parse(second).sealed.slice(0, 24),
  );
  assert.deepEqual(await decryptBackup(first, password, nodeCrypto), state);
  assert.deepEqual(await decryptBackup(second, password, backupCrypto), state);
  assert.deepEqual(decodeBackup(encodeBackup(state)), state);
});
test("native KDF matches WebCrypto exactly for the real work factor and Unicode passwords", async () => {
  const salt = new Uint8Array(16).fill(25);
  const native = await derivePasswordKey(password, salt, BACKUP_ITERATIONS);
  assert.deepEqual(
    native,
    await backupCrypto.derive(password, salt, BACKUP_ITERATIONS),
  );
  assert.equal(
    Buffer.from(
      await derivePasswordKey("password", new TextEncoder().encode("salt"), 1),
    ).toString("hex"),
    "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
  );
});
test("wrong passwords, changed ciphertext/nonce and changed salt fail authentication", async () => {
  const raw = await encryptBackup(fixture(), password, backupCrypto);
  await assert.rejects(
    decryptBackup(raw, "Другой пароль", backupCrypto),
    /Пароль неверный/,
  );
  for (const field of ["salt", "sealed"]) {
    const value = JSON.parse(raw);
    value[field] =
      (value[field][0] === "0" ? "1" : "0") + value[field].slice(1);
    await assert.rejects(
      decryptBackup(JSON.stringify(value), password, backupCrypto),
      /Пароль неверный/,
    );
  }
  const value = JSON.parse(raw);
  value.sealed =
    value.sealed.slice(0, -2) + (value.sealed.endsWith("00") ? "01" : "00");
  await assert.rejects(
    decryptBackup(JSON.stringify(value), password, backupCrypto),
    /Пароль неверный/,
  );
});
test("untrusted format and KDF work factor are rejected before any expensive derivation", async () => {
  const raw = await encryptBackup(fixture(), password, backupCrypto);
  let calls = 0;
  const spy = {
    ...backupCrypto,
    derive: async () => {
      calls++;
      throw new Error("should not derive");
    },
  };
  for (const patch of [
    { iterations: 2147483647 },
    { version: 2 },
    { salt: "00" },
    { sealed: "xyz" },
    { kdf: "unknown" },
    { cipher: "AES-CBC" },
  ]) {
    const invalid = JSON.stringify({ ...JSON.parse(raw), ...patch });
    assert.throws(() => parsePasswordEnvelope(invalid));
    await assert.rejects(decryptBackup(invalid, password, spy));
  }
  assert.equal(calls, 0);
  await assert.rejects(
    encryptBackup(fixture(), "short", backupCrypto),
    /10 до 256/,
  );
  await assert.rejects(encryptBackup(fixture(), "          ", backupCrypto));
  const invalid = fixture();
  invalid.transactions[0].category = "missing";
  await assert.rejects(encryptBackup(invalid, password, spy), /категорию/);
  assert.equal(calls, 0);
});
