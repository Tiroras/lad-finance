import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { assertProfileId } from "../src/domain/profiles";
import type { BackupReceipt } from "../src/infrastructure/storage/backupReceipts";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/infrastructure/storage/backupReceipts.ts", import.meta.url),
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
const prepared = (exportId: string, sha256 = "a".repeat(64)) => ({
  exportId,
  fileName: "lad-backup-2026-10-15.json",
  sha256,
  byteLength: 2191,
  encrypted: false,
  sourceKind: "current" as const,
  preparedAt: "2026-10-15T12:00:00.000Z",
});
const AT = "2026-10-15T12:03:00.000Z";

function fixture() {
  const items = new Map<string, string>([
    ["lad-profile-personal:lad-finance-v1", "synthetic ledger, unchanged"],
    ["lad-profiles-v1", "synthetic registry, unchanged"],
    ["lad-active-profile-v1", "personal"],
    ["lad-profile-personal:lad-last-backup-prepared", "2026-10-01"],
  ]);
  const original = new Map(items);
  let failWrite = false;
  const storage = {
    async getItem(key: string) {
      return items.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (failWrite) throw new Error("injected metadata write error");
      items.set(key, value);
    },
  };
  const exports =
    {} as typeof import("../src/infrastructure/storage/backupReceipts");
  runInNewContext(source, {
    exports,
    require: (name: string) => {
      if (name === "@react-native-async-storage/async-storage") return storage;
      assert.equal(name, "./profileStorage");
      return {
        profileStorageKey(profile: string, key: string) {
          assertProfileId(profile);
          return `lad-profile-${profile}:${key}`;
        },
      };
    },
  });
  const assertOtherRecordsUnchanged = () => {
    for (const [key, value] of original) assert.equal(items.get(key), value);
    for (const key of items.keys())
      assert.ok(original.has(key) || key.endsWith(":lad-backup-receipt-v1"));
  };
  return {
    items,
    get: exports.getBackupReceiptStore,
    fail: (value: boolean) => (failWrite = value),
    assertOtherRecordsUnchanged,
  };
}

test("backup preparation, explicit saving and reading are separate; old dates prove neither", async () => {
  const { get, assertOtherRecordsUnchanged } = fixture();
  const history = get("personal");
  assert.equal(await history.read(), null);
  await history.prepared(prepared("first"));
  let receipt = (await history.read())!;
  assert.equal(receipt.userConfirmedAt, undefined);
  assert.equal(receipt.readVerifiedAt, undefined);
  await history.confirmSaved("first", AT);
  receipt = (await history.read())!;
  assert.equal(receipt.userConfirmedAt, AT);
  assert.equal(receipt.readVerifiedAt, undefined);
  await history.verifyRead("first", prepared("first"), AT);
  assert.equal((await history.read())!.readVerifiedAt, AT);
  assertOtherRecordsUnchanged();
});

test("a different valid file and callbacks from an earlier export cannot verify the newest copy", async () => {
  const { get, assertOtherRecordsUnchanged } = fixture();
  const history = get("personal");
  await history.prepared(prepared("first"));
  await history.confirmSaved("first", AT);
  await history.prepared(prepared("second", "b".repeat(64)));
  assert.equal(await history.confirmSaved("first", AT), null);
  assert.equal(await history.verifyRead("first", prepared("first"), AT), null);
  assert.equal(await history.verifyRead("second", prepared("first"), AT), null);
  assert.equal(
    await history.verifyRead(
      "second",
      { sha256: "b".repeat(64), byteLength: 2192 },
      AT,
    ),
    null,
  );
  const receipt = (await history.read())!;
  assert.equal(receipt.exportId, "second");
  assert.equal(receipt.userConfirmedAt, undefined);
  assert.equal(receipt.readVerifiedAt, undefined);
  assertOtherRecordsUnchanged();
});

test("concurrent stale verification keeps the new export and profiles independent", async () => {
  const { get, assertOtherRecordsUnchanged } = fixture();
  const personal = get("personal");
  const demo = get("demo");
  await personal.prepared(prepared("first"));
  await demo.prepared(prepared("demo-export", "c".repeat(64)));
  const second = prepared("second", "b".repeat(64));
  await Promise.all([
    get("personal").prepared(second),
    personal.verifyRead("first", prepared("first"), AT),
    demo.confirmSaved("demo-export", AT),
  ]);
  assert.equal((await personal.read())!.exportId, "second");
  assert.equal((await personal.read())!.readVerifiedAt, undefined);
  assert.equal((await personal.read())!.userConfirmedAt, undefined);
  assert.equal((await demo.read())!.userConfirmedAt, AT);
  assert.equal((await demo.read())!.readVerifiedAt, undefined);
  // Reading the matching file does not assert that the user clicked "saved".
  await personal.verifyRead("second", second, AT);
  assert.equal((await personal.read())!.readVerifiedAt, AT);
  assert.equal((await personal.read())!.userConfirmedAt, undefined);
  assertOtherRecordsUnchanged();
});

test("receipt failure preserves prior metadata and can be retried without touching the ledger", async () => {
  const { get, fail, assertOtherRecordsUnchanged } = fixture();
  const history = get("personal");
  await history.prepared(prepared("first"));
  fail(true);
  await assert.rejects(
    history.confirmSaved("first", AT),
    /metadata write error/,
  );
  assert.equal((await history.read())!.userConfirmedAt, undefined);
  fail(false);
  await history.confirmSaved("first", AT);
  assert.equal((await history.read())!.userConfirmedAt, AT);
  assertOtherRecordsUnchanged();
});

test("corrupt or unrecognized receipt metadata is not rewritten during reading", async () => {
  const { items, get, assertOtherRecordsUnchanged } = fixture();
  const key = "lad-profile-personal:lad-backup-receipt-v1";
  for (const raw of [
    "broken json",
    " ".repeat(4097),
    JSON.stringify({ ...prepared("first"), version: 2 }),
    JSON.stringify({
      ...prepared("first"),
      version: 1,
      preparedAt: "2026-02-30T12:00:00.000Z",
    }),
    JSON.stringify({
      ...prepared("first"),
      version: 1,
      readVerifiedAt: "yesterday",
    }),
  ]) {
    items.set(key, raw);
    await assert.rejects(get("personal").read());
    assert.equal(items.get(key), raw);
  }
  await get("personal").prepared(prepared("replacement"));
  const receipt: BackupReceipt = (await get("personal").read())!;
  assert.equal(receipt.exportId, "replacement");
  assert.equal(receipt.readVerifiedAt, undefined);
  assertOtherRecordsUnchanged();
});
