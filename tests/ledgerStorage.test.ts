import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState } from "../src/domain/seed";
import {
  assertBackupSize,
  backupByteLength,
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
  MAX_BACKUP_BYTES,
} from "../src/domain/backup";
import { createPlainLedgerStorage } from "../src/infrastructure/storage/plainLedgerStorage";

function largeLedger(count: number, note: string) {
  const state = createInitialState(false, "2026-09-10");
  state.transactions = Array.from({ length: count }, (_, index) => ({
    id: `entry-${index}`,
    type: "expense" as const,
    title: "Покупка",
    amount: 100,
    baseAmount: 100,
    date: "2026-09-10",
    category: "other",
    accountId: "card",
    note,
  }));
  return state;
}

test("a large ledger is serialized compactly and reopens after storage restart", async () => {
  const state = largeLedger(13000, "a".repeat(150));
  assert.ok(JSON.stringify(state, null, 2).length > MAX_BACKUP_BYTES);
  assert.ok(Buffer.byteLength(encodeBackup(state), "utf8") < MAX_BACKUP_BYTES);
  let raw: string | null = null;
  const storage = {
    getItem: async () => raw,
    setItem: async (_key: string, value: string) => {
      raw = value;
    },
  };
  await createPlainLedgerStorage(storage).save(state);
  assert.deepEqual(await createPlainLedgerStorage(storage).load(), state);
});

test("oversized UTF-8 snapshots and invalid references never replace the previous ledger", async () => {
  const state = createInitialState(false, "2026-09-10");
  const previous = encodeBackup(state);
  let raw = previous;
  const storage = createPlainLedgerStorage({
    getItem: async () => raw,
    setItem: async (_key, value) => {
      raw = value;
    },
  });
  const oversized = largeLedger(9000, "Я".repeat(200));
  assert.ok(encodeBackup(oversized).length < MAX_BACKUP_BYTES);
  assert.ok(
    Buffer.byteLength(encodeBackup(oversized), "utf8") > MAX_BACKUP_BYTES,
  );
  await assert.rejects(storage.save(oversized), /5 МБ/);
  await assert.rejects(storage.recover(oversized), /5 МБ/);
  assert.equal(raw, previous);
  const invalid = largeLedger(1, "");
  invalid.transactions[0].accountId = "missing";
  await assert.rejects(storage.save(invalid));
  assert.equal(raw, previous);
  assert.deepEqual(await storage.load(), state);
});

test("legacy formatted JSON remains readable and portable snapshots use the same checked format", () => {
  const state = createInitialState(false, "2026-09-10");
  assert.deepEqual(decodeBackup(JSON.stringify(state, null, 2)), state);
  assert.deepEqual(decodeBackup(checkedBackupContent(state)), state);
});

test("an existing empty snapshot fails closed instead of initializing demo data", async () => {
  let writes = 0;
  const storage = createPlainLedgerStorage({
    getItem: async () => "",
    setItem: async () => {
      writes++;
    },
  });
  await assert.rejects(storage.load(), /Не удалось прочитать/);
  assert.equal(writes, 0);
});

test("oversized legacy ledgers can shrink gradually, with the same guard before UI changes and storage writes", async () => {
  const original = largeLedger(9000, "Я".repeat(200));
  let raw = encodeBackup(original);
  const adapter = {
    getItem: async () => raw,
    setItem: async (_key: string, value: string) => {
      raw = value;
    },
  };
  const first = { ...original, transactions: original.transactions.slice(1) };
  const second = { ...original, transactions: original.transactions.slice(2) };
  const firstBytes = backupByteLength(encodeBackup(first));
  assert.ok(firstBytes > MAX_BACKUP_BYTES);
  assert.equal(
    assertBackupSize(encodeBackup(first), backupByteLength(raw)),
    firstBytes,
  );
  // A fresh adapter must find the valid prior snapshot even without load().
  await createPlainLedgerStorage(adapter).save(first);
  const restarted = createPlainLedgerStorage(adapter);
  assert.deepEqual(await restarted.load(), first);
  await restarted.save(second);
  assert.deepEqual(decodeBackup(raw), second);
  const saved = raw;
  const previousBytes = backupByteLength(saved);
  for (const candidate of [original, first, second]) {
    assert.throws(
      () => assertBackupSize(encodeBackup(candidate), previousBytes),
      /5 МБ/,
    );
    await assert.rejects(restarted.save(candidate), /5 МБ/);
    await assert.rejects(restarted.recover(candidate), /5 МБ/);
    assert.equal(raw, saved);
  }
  const third = { ...original, transactions: original.transactions.slice(3) };
  await restarted.recover(third);
  assert.deepEqual(await createPlainLedgerStorage(adapter).load(), third);
  assert.throws(() => checkedBackupContent(third), /5 МБ/);
  const small = largeLedger(1, "");
  await restarted.save(small);
  await assert.rejects(restarted.save(third), /5 МБ/);
  assert.deepEqual(decodeBackup(raw), small);
});

test("corrupt previous data grants no legacy size allowance during explicit recovery", async () => {
  const oversized = largeLedger(9000, "Я".repeat(200));
  let raw = "broken".repeat(1_000_000);
  const storage = createPlainLedgerStorage({
    getItem: async () => raw,
    setItem: async (_key, value) => {
      raw = value;
    },
  });
  await assert.rejects(storage.recover(oversized), /5 МБ/);
  assert.equal(raw, "broken".repeat(1_000_000));
  const small = largeLedger(1, "");
  await storage.recover(small);
  assert.deepEqual(await storage.load(), small);
  // Fewer UTF-8 bytes cannot justify a string the legacy decoder cannot read.
  assert.throws(
    () =>
      assertBackupSize("a".repeat(MAX_BACKUP_BYTES + 1), 3 * MAX_BACKUP_BYTES),
    /5 МБ/,
  );
});
