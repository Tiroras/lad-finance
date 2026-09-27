import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as profiles from "../src/domain/profiles";
import * as notificationPlan from "../src/infrastructure/notifications/notificationPlan";
import { VAULT_STORAGE_KEY } from "../src/infrastructure/storage/vault";

const source = (path: string) =>
  ts.transpileModule(
    readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
const sources = {
  options: source("shared/lib/buildOptions"),
  reset: source("infrastructure/storage/developmentReset"),
  native: source("infrastructure/storage/resetDeviceData.native"),
  lock: source("infrastructure/device/deviceSecurity.native"),
  notifications: source("infrastructure/notifications/notifications.native"),
};

function fixture(dev: boolean, flag: string | undefined) {
  const items = new Map<string, string>();
  const secrets = new Map<string, string>();
  const calls: string[] = [];
  const failures = { remove: false, secureStore: false };
  let response: {
    notification: { request: { content: { data: { source: string } } } };
  } | null = {
    notification: { request: { content: { data: { source: "lad" } } } },
  };
  const notifications = new Map([
    ["lad.personal.payment", { profile: "personal" }],
    ["lad.demo.payment", { profile: "demo" }],
    ["lad.old-payment", {}],
    ["another-app.payment", {}],
  ]);
  const notificationModule = {
    setNotificationHandler() {},
    async getAllScheduledNotificationsAsync() {
      calls.push("notifications:read");
      return [...notifications].map(([identifier, data]) => ({
        identifier,
        content: { data },
      }));
    },
    async cancelScheduledNotificationAsync(id: string) {
      calls.push(`notification:remove:${id}`);
      notifications.delete(id);
    },
    getLastNotificationResponse: () => response,
    async clearLastNotificationResponseAsync() {
      calls.push("notification:clear-response");
      response = null;
    },
  };
  const modules: Record<string, unknown> = {
    "@react-native-async-storage/async-storage": {
      async getAllKeys() {
        calls.push("storage:keys");
        return [...items.keys()];
      },
      async multiGet(keys: string[]) {
        return keys.map((key) => [key, items.get(key) ?? null]);
      },
      async multiRemove(keys: string[]) {
        calls.push("storage:remove");
        if (failures.remove) throw new Error("storage unavailable");
        for (const key of keys) items.delete(key);
      },
    },
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      async deleteItemAsync(key: string, options: { keychainService: string }) {
        calls.push(`secret:remove:${options.keychainService}:${key}`);
        if (failures.secureStore) throw new Error("device locked");
        secrets.delete(`${options.keychainService}:${key}`);
      },
    },
    "react-native": { Platform: { OS: "android" } },
    "expo-local-authentication": {},
    "expo-screen-capture": {
      async allowScreenCaptureAsync(key: string) {
        calls.push(`screen:allow:${key}`);
      },
    },
    "../../domain/profiles": profiles,
    "../../domain/reminders": {},
    "./notificationPlan": notificationPlan,
    "./vault": { VAULT_STORAGE_KEY },
  };
  const load = (name: keyof typeof sources) => {
    const exports = {};
    runInNewContext(sources[name], {
      exports,
      __DEV__: dev,
      process: { env: { EXPO_PUBLIC_RESET_ON_START: flag } },
      require: (name: string) => {
        if (name.startsWith("expo-notifications/build/"))
          return notificationModule;
        assert.ok(name in modules, `Unexpected import: ${name}`);
        return modules[name];
      },
    });
    return exports;
  };
  modules["../../shared/lib/buildOptions"] = load("options");
  modules["../device/deviceSecurity"] = load("lock");
  modules["../notifications/notifications"] = load("notifications");
  modules["./resetDeviceData"] = load("native");
  const restart = () =>
    load("reset") as { resetDevelopmentData(): Promise<void> };
  return {
    items,
    secrets,
    calls,
    failures,
    notifications,
    restart,
    getResponse: () => response,
  };
}

test("reset requires literal true and development mode; release never touches storage", async () => {
  for (const dev of [false, true]) {
    for (const flag of [undefined, "", "false", "1", "TRUE", "true"]) {
      if (dev && flag === "true") continue;
      const { items, calls, restart } = fixture(dev, flag);
      items.set("lad-profiles-v1", "saved registry");
      await restart().resetDevelopmentData();
      assert.deepEqual([...items], [["lad-profiles-v1", "saved registry"]]);
      assert.deepEqual(calls, []);
    }
  }
});

test("fresh launch clears every Lad profile, old shared data and metadata, preserving unrelated keys", async () => {
  const { items, restart } = fixture(true, "true");
  for (const key of [
    "lad-profiles-v1",
    "lad-active-profile-v1",
    "lad-finance-v1",
    "lad-finance-encrypted-v1",
    "lad-last-backup-prepared",
    "lad-profile-personal:lad-finance-v1",
    "lad-profile-demo:lad-finance-encrypted-v1",
    "lad-profile-profile-550e8400-e29b-41d4-a716-446655440000:lad-finance-v1",
    "lad-profile-personal:lad-last-backup-prepared",
  ])
    items.set(key, "unreadable data must also be cleared");
  items.set("another-project", "keep");
  await restart().resetDevelopmentData();
  assert.deepEqual([...items], [["another-project", "keep"]]);
});

test("native reset removes only identified Lad vault keys, app lock and Lad reminders", async () => {
  const { items, secrets, calls, notifications, restart, getResponse } =
    fixture(true, "true");
  for (const profile of [
    "personal",
    "demo",
    "profile-550e8400-e29b-41d4-a716-446655440000",
  ]) {
    items.set(
      `lad-profile-${profile}:${VAULT_STORAGE_KEY}`,
      JSON.stringify({ keyId: "test-key" }),
    );
    secrets.set(
      `app.lad.finance.vault.${profile}:lad-${profile}-vault-key-test-key`,
      "test-secret",
    );
  }
  items.set(VAULT_STORAGE_KEY, JSON.stringify({ keyId: "legacy-key" }));
  secrets.set(
    "app.lad.finance.vault:lad-vault-key-legacy-key",
    "legacy-test-secret",
  );
  secrets.set("app.lad.finance.lock:lad-app-lock-v1", "on");
  secrets.set("another-app:key", "keep");
  await restart().resetDevelopmentData();
  assert.deepEqual([...secrets], [["another-app:key", "keep"]]);
  assert.deepEqual([...notifications.keys()], ["another-app.payment"]);
  assert.equal(getResponse(), null);
  assert.ok(calls.includes("screen:allow:lad-lock"));
  assert.equal(calls.at(-1), "storage:remove");
});

test("damaged envelopes and untrusted key IDs cannot target other SecureStore entries", async () => {
  const { items, secrets, restart } = fixture(true, "true");
  for (const [key, value] of [
    [`lad-profile-personal:${VAULT_STORAGE_KEY}`, "{broken"],
    [
      `lad-profile-demo:${VAULT_STORAGE_KEY}`,
      JSON.stringify({ keyId: "../key" }),
    ],
    [
      `lad-profile-unknown:${VAULT_STORAGE_KEY}`,
      JSON.stringify({ keyId: "valid-key" }),
    ],
    ["another-app", JSON.stringify({ keyId: "valid-key" })],
  ])
    items.set(key, value);
  secrets.set(
    "app.lad.finance.vault.unknown:lad-unknown-vault-key-valid-key",
    "keep",
  );
  await restart().resetDevelopmentData();
  assert.equal(secrets.size, 1);
  assert.equal(items.size, 1);
  assert.ok(items.has("another-app"));
});

test("one JS launch resets once; a full restart resets again", async () => {
  const { items, calls, restart } = fixture(true, "true");
  const runtime = restart();
  await Promise.all([
    runtime.resetDevelopmentData(),
    runtime.resetDevelopmentData(),
  ]);
  items.set("lad-profiles-v1", "newly created profile");
  await runtime.resetDevelopmentData();
  assert.equal(items.get("lad-profiles-v1"), "newly created profile");
  assert.equal(calls.filter((call) => call === "storage:remove").length, 1);
  await restart().resetDevelopmentData();
  assert.equal(items.size, 0);
});

test("failed reset rejects and allows retry instead of marking startup complete", async () => {
  for (const failure of ["secureStore", "remove"] as const) {
    const { items, calls, failures, restart } = fixture(true, "true");
    items.set("lad-profiles-v1", "previous profile");
    const runtime = restart();
    failures[failure] = true;
    await assert.rejects(runtime.resetDevelopmentData());
    assert.equal(items.get("lad-profiles-v1"), "previous profile");
    if (failure === "secureStore")
      assert.equal(calls.includes("storage:remove"), false);
    failures[failure] = false;
    await runtime.resetDevelopmentData();
    assert.equal(items.size, 0);
  }
});
