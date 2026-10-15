import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { encodeBackup } from "../src/domain/backup";
import { createInitialState } from "../src/domain/seed";
import * as profileDomain from "../src/domain/profiles";
import type { FinanceProfile } from "../src/infrastructure/storage/profileStorage";
import {
  createEncryptedFileStorage,
  parseCiphertextPointer,
  type EncryptedFileStorageDependencies,
} from "../src/infrastructure/storage/encryptedFileStorage";
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
const profileSource = ts.transpileModule(
  readFileSync(
    new URL("../src/infrastructure/storage/profileStorage.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
const ledgerKey = (profile: FinanceProfile, key = VAULT_STORAGE_KEY) =>
  `lad-profile-${profile}:${key}`;

function fixture() {
  const items = new Map<string, string>();
  const secrets = new Map<string, string>();
  const ciphertextFiles = new Map<string, string>();
  const cryptoCalls = { decrypt: 0 };
  const access: string[] = [];
  const failures = { key: null as string | null };
  const fileKey = (profile: FinanceProfile, name: string) =>
    `${profile}/${name}`;
  const sha256 = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const storage = {
    async getItem(key: string) {
      access.push(key);
      return items.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      access.push(key);
      if (key === failures.key) throw new Error("disk full");
      items.set(key, value);
    },
    async removeItem(key: string) {
      access.push(key);
      items.delete(key);
    },
  };
  const modules: Record<string, unknown> = {
    "@react-native-async-storage/async-storage": storage,
    "../../domain/profiles": profileDomain,
    "./ciphertextFiles.native": {
      createNativeEncryptedFileStorage(
        profile: FinanceProfile,
        metadata: EncryptedFileStorageDependencies["metadata"],
      ) {
        // Execute the real generation/pointer protocol. Only platform file I/O
        // is replaced; the Expo FileHandle contract has its own adapter tests.
        return createEncryptedFileStorage({
          profile,
          metadata,
          randomId: randomUUID,
          sha256: async (value) => sha256(value),
          files: {
            async writeNew(name, value) {
              const key = fileKey(profile, name);
              assert.equal(ciphertextFiles.has(key), false);
              ciphertextFiles.set(key, value);
            },
            async read(name, expectedBytes) {
              const raw = ciphertextFiles.get(fileKey(profile, name));
              if (raw === undefined || Buffer.byteLength(raw) !== expectedBytes)
                throw new Error("missing or incomplete ciphertext");
              return raw;
            },
            async remove(name) {
              ciphertextFiles.delete(fileKey(profile, name));
            },
          },
        });
      },
    },
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key: string, options: { keychainService: string }) =>
        secrets.get(`${options.keychainService}:${key}`) ?? null,
      setItemAsync: async (
        key: string,
        value: string,
        options: { keychainService: string },
      ) => {
        secrets.set(`${options.keychainService}:${key}`, value);
      },
      deleteItemAsync: async (
        key: string,
        options: { keychainService: string },
      ) => {
        secrets.delete(`${options.keychainService}:${key}`);
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
        cryptoCalls.decrypt++;
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
  const profileExports = {};
  runInNewContext(profileSource, {
    exports: profileExports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected profile import: ${name}`);
      return modules[name];
    },
  });
  modules["./profileStorage"] = profileExports;
  const restartAdapter = () => {
    const exports = {} as {
      getLedgerStorage: (
        profile: FinanceProfile,
      ) => ReturnType<typeof createVault>;
    };
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
    return exports.getLedgerStorage;
  };
  const restart = (profile: FinanceProfile = "personal") =>
    restartAdapter()(profile);
  const state = createInitialState(false, "2026-09-26");
  state.settings.name = "Проверка сохранения 🔐";
  const pointer = (profile: FinanceProfile) => {
    const value = parseCiphertextPointer(
      items.get(ledgerKey(profile))!,
      profile,
    );
    assert.ok(value, "native writes must commit a file pointer");
    return value;
  };
  const ciphertext = (profile: FinanceProfile) =>
    ciphertextFiles.get(fileKey(profile, pointer(profile).fileName))!;
  const replaceCiphertext = (profile: FinanceProfile, raw: string) => {
    const value = pointer(profile);
    ciphertextFiles.set(fileKey(profile, value.fileName), raw);
    // Match the physical checksum so the test exercises AES authentication,
    // rather than failing earlier at the generation checksum gate.
    items.set(
      ledgerKey(profile),
      JSON.stringify({
        ...value,
        bytes: Buffer.byteLength(raw),
        sha256: sha256(raw),
      }),
    );
  };
  const copyCiphertext = (from: FinanceProfile, to: FinanceProfile) => {
    const value = pointer(from);
    ciphertextFiles.set(fileKey(to, value.fileName), ciphertext(from));
    // A copied file with a target-bound pointer still has no target device key.
    items.set(ledgerKey(to), JSON.stringify({ ...value, profileId: to }));
  };
  return {
    items,
    secrets,
    restart,
    restartAdapter,
    state,
    access,
    failures,
    ciphertext,
    replaceCiphertext,
    copyCiphertext,
    cryptoCalls,
    ciphertextFiles,
  };
}

test("native adapter saves a base64 envelope in a generation file and reopens Unicode data after restart", async () => {
  const { items, restart, state, ciphertext } = fixture();
  const ledger = restart();
  await ledger.save(state);
  const first = items.get(ledgerKey("personal"))!;
  assert.equal(first.includes(state.settings.name), false);
  assert.ok(first.length < 1024);
  const encrypted = ciphertext("personal");
  assert.equal(encrypted.includes(state.settings.name), false);
  assert.match(JSON.parse(encrypted).sealed, /^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(await restart().load(), state);
  await ledger.save(state);
  assert.notEqual(items.get(ledgerKey("personal")), first);
  assert.deepEqual(await restart().load(), state);
});

test("native adapter verifies profile-local plaintext before deleting only that copy", async () => {
  const { items, restart, state } = fixture();
  items.set(ledgerKey("personal", LEGACY_STORAGE_KEY), encodeBackup(state));
  assert.deepEqual(await restart().load(), state);
  assert.equal(items.has(ledgerKey("personal", LEGACY_STORAGE_KEY)), false);
  assert.ok(items.has(ledgerKey("personal")));
  assert.deepEqual(await restart().load(), state);
});

test("native adapter rejects a changed authentication tag without overwriting the envelope", async () => {
  const { items, restart, state, ciphertext, replaceCiphertext, cryptoCalls } =
    fixture();
  await restart().save(state);
  const payload = JSON.parse(ciphertext("personal"));
  const bytes = Buffer.from(payload.sealed, "base64");
  bytes[bytes.length - 1] ^= 1;
  payload.sealed = bytes.toString("base64");
  const damaged = JSON.stringify(payload);
  replaceCiphertext("personal", damaged);
  const pointer = items.get(ledgerKey("personal"));
  const calls = cryptoCalls.decrypt;
  await assert.rejects(restart().load(), /расшифровать/);
  await assert.rejects(restart().save(state), /расшифровать/);
  assert.equal(
    cryptoCalls.decrypt,
    calls + 2,
    "both failures must reach AES-GCM authentication",
  );
  assert.equal(items.get(ledgerKey("personal")), pointer);
  assert.equal(ciphertext("personal"), damaged);
});

test("native profiles have independent vaults and keys, and ignore all former shared data", async () => {
  const { items, secrets, restartAdapter, state, access } = fixture();
  const shared = new Map([
    [LEGACY_STORAGE_KEY, encodeBackup(state)],
    [VAULT_STORAGE_KEY, "old shared encrypted data"],
  ]);
  for (const [key, value] of shared) items.set(key, value);
  secrets.set(
    "app.lad.finance.vault:lad-vault-key-old",
    "former shared secret",
  );
  const getLedger = restartAdapter();
  assert.equal(await getLedger("personal").load(), null);
  assert.equal(await getLedger("demo").load(), null);
  const demo = createInitialState(true, "2026-09-26");
  await getLedger("personal").save(state);
  await getLedger("demo").save(demo);
  const personalEnvelope = items.get(ledgerKey("personal"))!;
  const demoEnvelope = items.get(ledgerKey("demo"))!;
  assert.notEqual(
    JSON.parse(personalEnvelope).keyId,
    JSON.parse(demoEnvelope).keyId,
  );
  const profileSecrets = [...secrets.entries()].filter(
    ([key]) => key !== "app.lad.finance.vault:lad-vault-key-old",
  );
  assert.equal(profileSecrets.length, 2);
  assert.notEqual(profileSecrets[0][1], profileSecrets[1][1]);
  assert.ok(
    profileSecrets.some(([key]) =>
      key.startsWith("app.lad.finance.vault.personal:lad-personal-vault-key-"),
    ),
  );
  assert.ok(
    profileSecrets.some(([key]) =>
      key.startsWith("app.lad.finance.vault.demo:lad-demo-vault-key-"),
    ),
  );
  assert.deepEqual(await restartAdapter()("personal").load(), state);
  assert.deepEqual(await restartAdapter()("demo").load(), demo);

  const clearedDemo = createInitialState(false, "2026-09-26");
  await getLedger("demo").recover(clearedDemo);
  assert.equal(items.get(ledgerKey("personal")), personalEnvelope);
  assert.deepEqual(await restartAdapter()("personal").load(), state);
  assert.deepEqual(await restartAdapter()("demo").load(), clearedDemo);
  assert.equal(secrets.size, 3);
  assert.equal(
    secrets.get("app.lad.finance.vault:lad-vault-key-old"),
    "former shared secret",
  );
  for (const [key, value] of shared) {
    assert.equal(items.get(key), value);
    assert.equal(access.includes(key), false);
  }
});

test("native failed saves and recoveries cannot affect another profile", async () => {
  const { items, restartAdapter, failures, state } = fixture();
  const getLedger = restartAdapter();
  const demo = createInitialState(true, "2026-09-26");
  await getLedger("personal").save(state);
  await getLedger("demo").save(demo);
  const personalEnvelope = items.get(ledgerKey("personal"));
  const demoEnvelope = items.get(ledgerKey("demo"));
  failures.key = ledgerKey("demo");
  await assert.rejects(getLedger("demo").save(demo), /disk full/);
  await assert.rejects(getLedger("demo").recover(state), /disk full/);
  assert.equal(items.get(ledgerKey("personal")), personalEnvelope);
  assert.equal(items.get(ledgerKey("demo")), demoEnvelope);
  assert.deepEqual(await restartAdapter()("personal").load(), state);
  assert.deepEqual(await restartAdapter()("demo").load(), demo);
  const updated = {
    ...state,
    settings: { ...state.settings, name: "Личный учёт" },
  };
  await getLedger("personal").save(updated);
  assert.deepEqual(await restartAdapter()("personal").load(), updated);
  assert.deepEqual(await restartAdapter()("demo").load(), demo);
});

test("native profiles cannot decrypt each other's copied envelope", async () => {
  const { items, restart, state, copyCiphertext } = fixture();
  await restart("personal").save(state);
  const personalEnvelope = items.get(ledgerKey("personal"))!;
  items.set(ledgerKey("demo"), personalEnvelope);
  await assert.rejects(restart("demo").load(), /файл зашифрованного/);
  copyCiphertext("personal", "demo");
  await assert.rejects(restart("demo").load(), /Ключ устройства/);
  assert.deepEqual(await restart("personal").load(), state);
});

test("custom native profiles use separate device keys and survive failures, resets and corruption independently", async () => {
  const { items, secrets, restartAdapter, state, failures, copyCiphertext } =
    fixture();
  const family = "profile-11111111-1111-4111-8111-111111111111";
  const work = "profile-22222222-2222-4222-8222-222222222222";
  const familyState = structuredClone(state);
  familyState.settings.name = "Семья";
  familyState.accounts[0].openingBalance = 123400;
  const workState = structuredClone(state);
  workState.settings.name = "Работа";
  workState.accounts[0].openingBalance = 567800;
  const getLedger = restartAdapter();
  assert.equal(getLedger(family), getLedger(family));
  await getLedger(family).save(familyState);
  await getLedger(work).save(workState);
  const familyRaw = items.get(ledgerKey(family))!;
  const workRaw = items.get(ledgerKey(work))!;
  const familyKey = [...secrets.entries()].find(([key]) =>
    key.startsWith(`app.lad.finance.vault.${family}:lad-${family}-vault-key-`),
  );
  const workKey = [...secrets.entries()].find(([key]) =>
    key.startsWith(`app.lad.finance.vault.${work}:lad-${work}-vault-key-`),
  );
  assert.ok(familyKey);
  assert.ok(workKey);
  assert.notEqual(familyKey[1], workKey[1]);
  assert.deepEqual(await restartAdapter()(family).load(), familyState);
  assert.deepEqual(await restartAdapter()(work).load(), workState);

  failures.key = ledgerKey(family);
  await assert.rejects(getLedger(family).save(workState), /disk full/);
  await assert.rejects(getLedger(family).recover(workState), /disk full/);
  assert.equal(items.get(ledgerKey(family)), familyRaw);
  assert.equal(items.get(ledgerKey(work)), workRaw);
  assert.deepEqual(await restartAdapter()(family).load(), familyState);
  assert.deepEqual(await restartAdapter()(work).load(), workState);

  failures.key = null;
  const empty = createInitialState(false, "2026-09-27");
  await getLedger(family).recover(empty);
  assert.deepEqual(await restartAdapter()(family).load(), empty);
  assert.equal(items.get(ledgerKey(work)), workRaw);
  assert.equal(secrets.get(workKey[0]), workKey[1]);
  assert.equal(secrets.has(familyKey[0]), false);

  // A foreign pointer fails its profile binding; rebinding and copying the
  // ciphertext still cannot move the other profile's SecureStore key service.
  items.set(ledgerKey(family), workRaw);
  await assert.rejects(restartAdapter()(family).load(), /файл зашифрованного/);
  copyCiphertext(work, family);
  const copiedRaw = items.get(ledgerKey(family));
  await assert.rejects(restartAdapter()(family).load(), /Ключ устройства/);
  await assert.rejects(restartAdapter()(family).save(familyState));
  assert.equal(items.get(ledgerKey(family)), copiedRaw);
  await restartAdapter()(family).recover(familyState);
  assert.deepEqual(await restartAdapter()(family).load(), familyState);
  assert.equal(items.get(ledgerKey(work)), workRaw);
  assert.equal(secrets.get(workKey[0]), workKey[1]);
  assert.deepEqual(await restartAdapter()(work).load(), workState);
  assert.equal(await getLedger("personal").load(), null);
  assert.equal(await getLedger("demo").load(), null);
  assert.throws(() => getLedger("profile-invalid"), /определить профиль/);
});
