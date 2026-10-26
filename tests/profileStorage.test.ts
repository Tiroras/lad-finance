import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { encodeBackup } from "../src/domain/backup";
import { createInitialState } from "../src/domain/seed";
import * as profileDomain from "../src/domain/profiles";
import { createPlainLedgerStorage } from "../src/infrastructure/storage/plainLedgerStorage";
import {
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
} from "../src/infrastructure/storage/vault";

const sources = Object.fromEntries(
  ["profileStorage", "ledgerStorage", "backupHistory"].map((name) => {
    const filename = new URL(
      `../src/infrastructure/storage/${name}.ts`,
      import.meta.url,
    );
    return [
      name,
      ts.transpileModule(readFileSync(filename, "utf8"), {
        fileName: filename.pathname,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
    ];
  }),
);

function fixture() {
  const items = new Map<string, string>();
  const access: string[] = [];
  const failures = { key: null as string | null, readKeys: false };
  const storage = {
    async getAllKeys() {
      access.push("getAllKeys");
      if (failures.readKeys) throw new Error("storage unavailable");
      return [...items.keys()];
    },
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
    "expo-crypto": { randomUUID },
    "../../domain/profiles": profileDomain,
    "./plainLedgerStorage": { createPlainLedgerStorage },
    "./vault": { LEGACY_STORAGE_KEY, VAULT_STORAGE_KEY },
  };
  function load<T>(name: string): T {
    const exports = {};
    runInNewContext(sources[name], {
      exports,
      require: (name: string) => {
        assert.ok(name in modules, `Unexpected storage import: ${name}`);
        return modules[name];
      },
    });
    return exports as T;
  }
  const profiles =
    load<typeof import("../src/infrastructure/storage/profileStorage")>(
      "profileStorage",
    );
  modules["./profileStorage"] = profiles;
  const restart = () =>
    load<typeof import("../src/infrastructure/storage/ledgerStorage")>(
      "ledgerStorage",
    );
  const history =
    load<typeof import("../src/infrastructure/storage/backupHistory")>(
      "backupHistory",
    );
  return { items, access, failures, profiles, restart, history };
}

test("first entry detection ignores old shared data, preferences and unrelated keys without changing them", async () => {
  const { profiles, items, access } = fixture();
  assert.equal(await profiles.hasStoredProfiles(), false);
  const original = new Map([
    [LEGACY_STORAGE_KEY, "old shared ledger"],
    [VAULT_STORAGE_KEY, "old shared vault"],
    ["lad-active-profile-v1", "personal"],
    ["lad-last-backup-prepared", "2026-09-26"],
    ["lad-profile-personal:lad-last-backup-prepared", "2026-09-26"],
    ["lad-profile-personal:unrelated", "other preference"],
    ["unrelated:lad-profile-personal:lad-finance-v1", "other app data"],
    ["lad-profiles-v1-unrelated", "other registry"],
  ]);
  for (const [key, value] of original) items.set(key, value);
  assert.equal(await profiles.hasStoredProfiles(), false);
  assert.deepEqual(items, original);
  assert.deepEqual(access, ["getAllKeys", "getAllKeys"]);
});

test("existing personal, demo and unregistered custom ledgers are never treated as first entry even when empty or damaged", async () => {
  const { profiles, items, access } = fixture();
  const custom = "profile-11111111-1111-4111-8111-111111111111";
  for (const profile of ["personal", "demo", custom] as const) {
    for (const ledgerKey of [LEGACY_STORAGE_KEY, VAULT_STORAGE_KEY]) {
      for (const value of ["", "damaged data", "{}"] as const) {
        items.clear();
        access.length = 0;
        const key = profiles.profileStorageKey(profile, ledgerKey);
        items.set(key, value);
        assert.equal(await profiles.hasStoredProfiles(), true, key);
        assert.deepEqual([...items.entries()], [[key, value]]);
        assert.equal(items.has("lad-profiles-v1"), false);
        assert.deepEqual(access, ["getAllKeys"]);
      }
    }
  }
});

test("a present registry prevents first entry independently of its contents", async () => {
  const { profiles, items, access } = fixture();
  for (const value of [
    "",
    "damaged registry",
    JSON.stringify({ version: 1, profiles: [] }),
    JSON.stringify({
      version: 1,
      profiles: profileDomain.createDefaultProfiles(),
    }),
  ]) {
    items.set("lad-profiles-v1", value);
    access.length = 0;
    assert.equal(await profiles.hasStoredProfiles(), true);
    assert.equal(items.get("lad-profiles-v1"), value);
    assert.deepEqual(access, ["getAllKeys"]);
  }
});

test("failed first entry detection rejects instead of treating unreadable storage as empty", async () => {
  const { profiles, items, access, failures } = fixture();
  const key = profiles.profileStorageKey("personal", VAULT_STORAGE_KEY);
  items.set(key, "preserved envelope");
  failures.readKeys = true;
  await assert.rejects(profiles.hasStoredProfiles(), /storage unavailable/);
  assert.deepEqual([...items.entries()], [[key, "preserved envelope"]]);
  assert.deepEqual(access, ["getAllKeys"]);
  failures.readKeys = false;
  assert.equal(await profiles.hasStoredProfiles(), true);
});

test("profile preference always defaults to personal and ignores disabled or unknown choices without rewriting them", async () => {
  const { profiles, items } = fixture();
  assert.equal(await profiles.readActiveProfile(false), "personal");
  assert.equal(await profiles.readActiveProfile(true), "personal");
  await profiles.writeActiveProfile("personal");
  assert.equal(await profiles.readActiveProfile(true), "personal");
  await profiles.writeActiveProfile("demo");
  assert.equal(await profiles.readActiveProfile(false), "personal");
  assert.equal(items.get("lad-active-profile-v1"), "demo");
  assert.equal(await profiles.readActiveProfile(true), "demo");
  items.set("lad-active-profile-v1", "broken-preference");
  assert.equal(await profiles.readActiveProfile(true), "personal");
  assert.equal(items.get("lad-active-profile-v1"), "broken-preference");
});

test("missing catalog with a custom namespace requires recovery, while legacy personal remains readable", async () => {
  const { profiles, items } = fixture();
  const personal = profiles.profileStorageKey("personal", LEGACY_STORAGE_KEY);
  items.set(personal, encodeBackup(createInitialState(false)));
  assert.deepEqual(
    await profiles.readProfiles(),
    profileDomain.createDefaultProfiles(),
  );
  const custom = profiles.profileStorageKey(
    "profile-11111111-1111-4111-8111-111111111111",
    VAULT_STORAGE_KEY,
  );
  items.set(custom, "unavailable encrypted bytes");
  const before = new Map(items);
  await assert.rejects(profiles.readProfiles(), /список профилей/);
  assert.deepEqual(items, before);
});

test("web profiles ignore former shared records and preserve separate ledgers across save, restart and reset", async () => {
  const { items, access, restart, profiles } = fixture();
  const personal = createInitialState(false, "2026-09-26");
  personal.settings.name = "Личный учёт";
  const demo = createInitialState(true, "2026-09-26");
  const old = new Map([
    [LEGACY_STORAGE_KEY, encodeBackup(demo)],
    [VAULT_STORAGE_KEY, "former encrypted envelope"],
  ]);
  for (const [key, value] of old) items.set(key, value);
  const { getLedgerStorage } = restart();
  assert.equal(await getLedgerStorage("personal").load(), null);
  assert.equal(await getLedgerStorage("demo").load(), null);
  await getLedgerStorage("personal").save(personal);
  await getLedgerStorage("demo").save(demo);
  assert.deepEqual(
    await restart().getLedgerStorage("personal").load(),
    personal,
  );
  assert.deepEqual(await restart().getLedgerStorage("demo").load(), demo);
  const personalKey = profiles.profileStorageKey(
    "personal",
    LEGACY_STORAGE_KEY,
  );
  const personalRaw = items.get(personalKey);
  const fresh = createInitialState(false, "2026-09-27");
  await getLedgerStorage("demo").recover(fresh);
  assert.deepEqual(await restart().getLedgerStorage("demo").load(), fresh);
  assert.equal(items.get(personalKey), personalRaw);
  assert.deepEqual(
    await restart().getLedgerStorage("personal").load(),
    personal,
  );
  for (const [key, value] of old) {
    assert.equal(items.get(key), value);
    assert.equal(access.includes(key), false);
  }
});

test("a failed save or damaged web profile never affects saving and recovering the other profile", async () => {
  const { items, restart, failures, profiles } = fixture();
  const { getLedgerStorage } = restart();
  const personal = createInitialState(false, "2026-09-26");
  const demo = createInitialState(true, "2026-09-26");
  await getLedgerStorage("personal").save(personal);
  await getLedgerStorage("demo").save(demo);
  const personalKey = profiles.profileStorageKey(
    "personal",
    LEGACY_STORAGE_KEY,
  );
  const demoKey = profiles.profileStorageKey("demo", LEGACY_STORAGE_KEY);
  const demoRaw = items.get(demoKey);
  failures.key = personalKey;
  await assert.rejects(getLedgerStorage("personal").save(demo), /disk full/);
  await assert.rejects(getLedgerStorage("personal").recover(demo), /disk full/);
  assert.equal(items.get(demoKey), demoRaw);
  assert.deepEqual(
    await restart().getLedgerStorage("personal").load(),
    personal,
  );
  failures.key = null;
  items.set(personalKey, "damaged personal data");
  await assert.rejects(restart().getLedgerStorage("personal").load());
  await getLedgerStorage("demo").save(demo);
  assert.equal(items.get(personalKey), "damaged personal data");
  await restart().getLedgerStorage("personal").recover(personal);
  assert.deepEqual(
    await restart().getLedgerStorage("personal").load(),
    personal,
  );
  assert.deepEqual(await restart().getLedgerStorage("demo").load(), demo);
});

test("backup history is separate for each profile and ignores former shared history", async () => {
  const { items, access, history } = fixture();
  items.set("lad-last-backup-prepared", "2025-01-01");
  assert.equal(await history.readLastBackupDate("personal"), null);
  assert.equal(await history.readLastBackupDate("demo"), null);
  await history.writeLastBackupDate("personal", "2026-09-26");
  assert.equal(await history.readLastBackupDate("personal"), "2026-09-26");
  assert.equal(await history.readLastBackupDate("demo"), null);
  await history.writeLastBackupDate("demo", "2026-09-27");
  assert.equal(await history.readLastBackupDate("personal"), "2026-09-26");
  assert.equal(await history.readLastBackupDate("demo"), "2026-09-27");
  assert.equal(items.get("lad-last-backup-prepared"), "2025-01-01");
  assert.equal(access.includes("lad-last-backup-prepared"), false);
});

test("profile registry persists custom names and selection with or without demo enabled", async () => {
  const { profiles, items } = fixture();
  const initial = await profiles.readProfiles();
  assert.deepEqual(initial, [{ id: "personal", name: "Личный" }]);
  assert.equal(items.has("lad-profiles-v1"), false);
  const id = profiles.generateProfileId();
  assert.match(
    id,
    /^profile-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  const custom = profileDomain.addProfile(initial, id, "  Семейный  ");
  await profiles.writeProfiles(custom);
  assert.deepEqual(await profiles.readProfiles(), custom);
  assert.deepEqual(JSON.parse(items.get("lad-profiles-v1")!), {
    version: 1,
    profiles: custom,
  });
  await profiles.writeActiveProfile(id);
  assert.equal(await profiles.readActiveProfile(false), id);
  assert.equal(await profiles.readActiveProfile(true), id);
  assert.equal(await profiles.readActiveProfile(false, initial), "personal");
  assert.equal(items.get("lad-active-profile-v1"), id);
  const renamed = profileDomain.renameProfile(custom, id, "Семья и дом");
  await profiles.writeProfiles(renamed);
  assert.equal((await profiles.readProfiles())[1].name, "Семья и дом");
  assert.equal(await profiles.readActiveProfile(false), id);
});

test("damaged registry and failed metadata writes preserve all previous records", async () => {
  const { profiles, items, failures } = fixture();
  const registryKey = "lad-profiles-v1";
  for (const damaged of [
    "broken json",
    "null",
    JSON.stringify({
      version: 3,
      profiles: profileDomain.createDefaultProfiles(),
    }),
    JSON.stringify({ version: 1, profiles: [] }),
    JSON.stringify({
      version: 1,
      profiles: [{ id: "personal", name: "Other" }],
    }),
  ]) {
    items.set(registryKey, damaged);
    await assert.rejects(profiles.readProfiles(), /Данные сохранены/);
    await assert.rejects(profiles.readActiveProfile(false), /Данные сохранены/);
    assert.equal(items.get(registryKey), damaged);
  }
  const initial = profileDomain.createDefaultProfiles();
  await profiles.writeProfiles(initial);
  const previous = items.get(registryKey);
  await assert.rejects(
    profiles.writeProfiles([{ id: "personal", name: "Other" }]),
  );
  assert.equal(items.get(registryKey), previous);
  const added = profileDomain.addProfile(
    initial,
    profiles.generateProfileId(),
    "Работа",
  );
  failures.key = registryKey;
  await assert.rejects(profiles.writeProfiles(added), /disk full/);
  assert.equal(items.get(registryKey), previous);
  await profiles.writeActiveProfile("personal");
  failures.key = "lad-active-profile-v1";
  await assert.rejects(profiles.writeActiveProfile(added[1].id), /disk full/);
  assert.equal(items.get("lad-active-profile-v1"), "personal");
});

test("deleted personal is not recreated by a missing or disabled profile preference", async () => {
  const { profiles } = fixture();
  const custom = "profile-550e8400-e29b-41d4-a716-446655440000";
  await profiles.writeProfiles([{ id: custom, name: "Рабочий" }]);
  assert.equal(await profiles.readActiveProfile(false), custom);
  await profiles.writeActiveProfile("personal");
  assert.equal(await profiles.readActiveProfile(false), custom);
  await profiles.writeActiveProfile("demo");
  assert.equal(await profiles.readActiveProfile(false), custom);
  await profiles.writeProfiles([]);
  assert.deepEqual(await profiles.readProfiles(), []);
});

test("custom web ledgers keep data and backup dates isolated through failures, reset and recovery", async () => {
  const { profiles, items, failures, restart, history } = fixture();
  const first = profiles.generateProfileId();
  const second = profiles.generateProfileId();
  const firstState = createInitialState(false, "2026-09-26");
  firstState.settings.name = "Семья";
  firstState.accounts[0].openingBalance = 123400;
  const secondState = createInitialState(false, "2026-09-26");
  secondState.settings.name = "Работа";
  secondState.accounts[0].openingBalance = 567800;
  const getLedger = restart().getLedgerStorage;
  assert.equal(getLedger(first), getLedger(first));
  await getLedger(first).save(firstState);
  await getLedger(second).save(secondState);
  await history.writeLastBackupDate(first, "2026-09-26");
  await history.writeLastBackupDate(second, "2026-09-27");
  assert.equal(await history.readLastBackupDate(first), "2026-09-26");
  assert.equal(await history.readLastBackupDate(second), "2026-09-27");
  assert.equal(await history.readLastBackupDate("personal"), null);
  assert.deepEqual(await restart().getLedgerStorage(first).load(), firstState);
  assert.deepEqual(
    await restart().getLedgerStorage(second).load(),
    secondState,
  );
  const firstKey = profiles.profileStorageKey(first, LEGACY_STORAGE_KEY);
  const secondKey = profiles.profileStorageKey(second, LEGACY_STORAGE_KEY);
  const firstBefore = items.get(firstKey);
  const secondBefore = items.get(secondKey);
  failures.key = firstKey;
  await assert.rejects(getLedger(first).save(secondState), /disk full/);
  await assert.rejects(getLedger(first).recover(secondState), /disk full/);
  assert.equal(items.get(firstKey), firstBefore);
  assert.equal(items.get(secondKey), secondBefore);
  failures.key = null;
  await getLedger(first).recover(createInitialState(false, "2026-09-27"));
  assert.equal(items.get(secondKey), secondBefore);
  assert.deepEqual(
    await restart().getLedgerStorage(second).load(),
    secondState,
  );
  items.set(firstKey, "damaged custom ledger");
  await assert.rejects(restart().getLedgerStorage(first).load());
  await assert.rejects(restart().getLedgerStorage(first).save(firstState));
  assert.equal(items.get(firstKey), "damaged custom ledger");
  await restart().getLedgerStorage(first).recover(firstState);
  assert.deepEqual(await restart().getLedgerStorage(first).load(), firstState);
  assert.equal(items.get(secondKey), secondBefore);
  assert.equal(await getLedger("personal").load(), null);
  assert.equal(await getLedger("demo").load(), null);
  assert.throws(() => getLedger("profile-invalid"), /определить профиль/);
});
