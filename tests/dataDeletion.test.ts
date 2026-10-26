import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDataDeletion,
  DATA_DELETION_KEY,
} from "../src/infrastructure/storage/dataDeletion";
import {
  decodeProfileRegistry,
  encodeProfileRegistry,
  type FinanceProfile,
} from "../src/domain/profiles";

const custom: FinanceProfile = "profile-11111111-1111-4111-8111-111111111111";
const catalogKey = "lad-profiles-v1",
  activeKey = "lad-active-profile-v1";
const learningKey = "lad-learning-progress-v1";
const ledgerKey = (id: FinanceProfile) => `lad-profile-${id}:lad-finance-v1`;

function fixture() {
  const items = new Map([
    [
      catalogKey,
      encodeProfileRegistry([
        { id: "personal", name: "Личный" },
        { id: custom, name: "Семья" },
      ]),
    ],
    [activeKey, custom],
    [learningKey, "learning"],
    [ledgerKey("personal"), "personal data"],
    [ledgerKey(custom), "family data"],
    [ledgerKey("demo"), "demo data"],
    [`lad-profile-${custom}:lad-drafts-v1`, "family draft"],
    ["lad-profile-personal:lad-last-backup-prepared", "backup date"],
    ["lad-finance-v1", "old shared data"],
    ["another-app", "keep"],
  ]);
  const calls: (FinanceProfile | undefined)[] = [];
  let fail = "";
  const storage = {
    async getAllKeys() {
      return [...items.keys()];
    },
    async getItem(key: string) {
      if (key === DATA_DELETION_KEY && fail === "readAfterRemoval") {
        fail = "";
        throw new Error("final read failed");
      }
      return items.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (fail === key) throw new Error("write failed");
      items.set(key, value);
    },
    async removeItem(key: string) {
      if (fail === key) throw new Error("remove failed");
      items.delete(key);
      if (key === DATA_DELETION_KEY && fail === "finalRead")
        fail = "readAfterRemoval";
    },
    async multiGet(keys: string[]) {
      return keys.map((key) => [key, items.get(key) ?? null] as const);
    },
    async multiRemove(keys: string[]) {
      for (const key of keys) {
        if (fail === key) throw new Error("partially removed");
        items.delete(key);
      }
    },
  };
  const restart = () =>
    createDataDeletion({
      storage,
      profiles: async () => decodeProfileRegistry(items.get(catalogKey)!),
      readCatalog: () => storage.getItem(catalogKey),
      writeCatalog: (raw) =>
        raw === null
          ? storage.removeItem(catalogKey)
          : storage.setItem(catalogKey, raw),
      readActive: () => storage.getItem(activeKey),
      writeActive: (raw) =>
        raw === null
          ? storage.removeItem(activeKey)
          : storage.setItem(activeKey, raw),
      clearLearning: () => storage.removeItem(learningKey),
      async resetDevice(_entries, target) {
        assert.ok(
          items.has(DATA_DELETION_KEY),
          "intent must precede native deletion",
        );
        if (fail === "native") throw new Error("device locked");
        calls.push(target);
      },
    });
  return {
    items,
    calls,
    restart,
    fail: (value: string) => {
      fail = value;
    },
  };
}

test("deleting one profile removes every scoped record and preserves all other data", async () => {
  const { items, calls, restart } = fixture();
  const before = new Map(items);
  await restart().run({ type: "profile", profile: custom });
  assert.deepEqual(calls, [custom]);
  assert.equal(items.get(activeKey), "personal");
  assert.deepEqual(decodeProfileRegistry(items.get(catalogKey)!), [
    { id: "personal", name: "Личный" },
  ]);
  assert.ok(
    ![...items.keys()].some((key) => key.startsWith(`lad-profile-${custom}:`)),
  );
  for (const [key, value] of before)
    if (
      ![catalogKey, activeKey].includes(key) &&
      !key.startsWith(`lad-profile-${custom}:`)
    )
      assert.equal(items.get(key), value, key);
  assert.equal(items.has(DATA_DELETION_KEY), false);
});

test("deleting personal preserves the selected custom profile; deleting the last profile resets learning", async () => {
  const { items, restart } = fixture();
  await restart().run({ type: "profile", profile: "personal" });
  assert.equal(items.get(activeKey), custom);
  assert.deepEqual(decodeProfileRegistry(items.get(catalogKey)!), [
    { id: custom, name: "Семья" },
  ]);
  assert.equal(items.get(learningKey), "learning");
  await restart().run({ type: "profile", profile: custom });
  assert.deepEqual(decodeProfileRegistry(items.get(catalogKey)!), []);
  assert.equal(items.has(activeKey), false);
  assert.equal(items.has(learningKey), false);
  assert.equal(items.get(ledgerKey("demo")), "demo data");
});

test("full reset removes all Lad data including old shared records but leaves unrelated storage", async () => {
  const { items, calls, restart } = fixture();
  await restart().run({ type: "all" });
  assert.deepEqual([...items], [["another-app", "keep"]]);
  assert.deepEqual(calls, [undefined]);
  await restart().run();
  assert.deepEqual([...items], [["another-app", "keep"]]);
});

test("failed confirmation write and unknown target never begin destructive work", async () => {
  const { items, calls, restart, fail } = fixture();
  const before = new Map(items);
  fail(DATA_DELETION_KEY);
  await assert.rejects(restart().run({ type: "all" }));
  assert.deepEqual(items, before);
  assert.deepEqual(calls, []);
  fail("");
  await assert.rejects(
    restart().run({
      type: "profile",
      profile: "profile-22222222-2222-4222-8222-222222222222",
    }),
  );
  assert.deepEqual(items, before);
});

test("a restart resumes only the confirmed target after native, partial removal and metadata failures", async () => {
  for (const stage of [
    "native",
    ledgerKey(custom),
    catalogKey,
    activeKey,
    DATA_DELETION_KEY,
  ]) {
    const f = fixture();
    // To fail journal removal rather than initial creation, start with a valid pending operation.
    f.fail("native");
    await assert.rejects(f.restart().run({ type: "profile", profile: custom }));
    f.fail(stage);
    await assert.rejects(f.restart().run());
    assert.ok(f.items.has(DATA_DELETION_KEY));
    f.fail("");
    await f.restart().run();
    assert.equal(f.items.has(ledgerKey(custom)), false);
    assert.equal(f.items.get(ledgerKey("personal")), "personal data");
    assert.equal(f.items.get(activeKey), "personal");
    assert.equal(f.items.has(DATA_DELETION_KEY), false);
  }
});

test("an invalid deletion journal fails closed without clearing anything", async () => {
  const { items, calls, restart } = fixture();
  for (const raw of [
    "broken",
    "null",
    JSON.stringify({
      version: 1,
      request: { type: "profile", profile: "../personal" },
      catalog: "{}",
      active: null,
    }),
  ]) {
    items.set(DATA_DELETION_KEY, raw);
    const before = new Map(items);
    await assert.rejects(restart().run());
    assert.deepEqual(items, before);
  }
  assert.deepEqual(calls, []);
});

test("retry succeeds after journal removal whose final readback failed, without accepting a new missing target", async () => {
  const f = fixture();
  const deletion = f.restart();
  f.fail("finalRead");
  const request = { type: "profile", profile: custom } as const;
  await assert.rejects(deletion.run(request), /final read failed/);
  assert.equal(f.items.has(DATA_DELETION_KEY), false);
  assert.equal(f.items.has(ledgerKey(custom)), false);
  await deletion.run(request);
  assert.equal(f.items.get(ledgerKey("personal")), "personal data");
  assert.equal(f.items.has(DATA_DELETION_KEY), false);
  await assert.rejects(deletion.run(request), /Профиль не найден/);
});
