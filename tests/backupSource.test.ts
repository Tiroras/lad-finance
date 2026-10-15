import assert from "node:assert/strict";
import { test } from "node:test";
import { captureBackupSource } from "../src/state/finance/backupSource";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { fingerprintText } from "../src/domain/backupRecovery";
import type { FinanceState } from "../src/domain/types";
import type { LedgerInspection } from "../src/infrastructure/storage/ledgerContracts";

const today = "2026-10-15";
function state(amount: number) {
  const value = createInitialState(false, today);
  value.accounts[0].openingBalance = amount;
  value.settings.exchange = { automatic: false, rates: {} };
  return value;
}
function readable(value: FinanceState): LedgerInspection {
  const sourceText = encodeBackup(value);
  return {
    status: "readable",
    sourceText,
    state: decodeBackup(sourceText, today),
    snapshotIdentity: {
      format: "plaintext",
      recordFingerprint: fingerprintText(sourceText),
      sourceFingerprint: fingerprintText(sourceText),
    },
    normalizationDate: today,
    normalizationVersion: 1,
    snapshotDate: today,
  };
}
const capture = (value: FinanceState) => ({
  profileId: "personal" as const,
  profileName: "Личный",
  state: value,
  revision: 12,
  today,
});

test("backup source binds a saved revision to exact inspected source bytes and accepts normalized field order", async () => {
  const s1 = state(10000),
    inspected = readable(s1);
  let saved = false;
  const result = await captureBackupSource({
    ...capture(s1),
    save: async () => {
      saved = true;
    },
    inspect: async (options) => {
      assert.equal(saved, true);
      assert.equal(options.normalizationDate, today);
      return inspected;
    },
  });
  assert.equal(result.kind, "current");
  assert.equal(result.capturedRevision, 12);
  assert.equal(result.sourceRevision, 12);
  assert.equal(result.sourceText, encodeBackup(s1));
});

test("failed saving returns the entire older saved revision explicitly, never current UI data", async () => {
  const s1 = state(10000),
    s2 = state(7500);
  const result = await captureBackupSource({
    ...capture(s2),
    save: async () => {
      throw new Error("disk full");
    },
    inspect: async () => readable(s1),
  });
  assert.equal(result.kind, "last-readable-saved");
  if (result.kind === "last-readable-saved")
    assert.equal(result.reason, "save-failed");
  assert.equal(result.sourceRevision, null);
  assert.equal(result.sourceText, encodeBackup(s1));
  assert.equal(s2.accounts[0].openingBalance, 7500);
});

test("a successful save callback cannot label a different inspected snapshot as current", async () => {
  const result = await captureBackupSource({
    ...capture(state(7500)),
    save: async () => {},
    inspect: async () => readable(state(10000)),
  });
  assert.equal(result.kind, "last-readable-saved");
  if (result.kind === "last-readable-saved")
    assert.equal(result.reason, "revision-unconfirmed");
});

test("captured profile and state remain bound while an asynchronous save waits", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let current = state(10000);
  const captured = current;
  const running = captureBackupSource({
    ...capture(captured),
    save: () => gate,
    inspect: async () => readable(captured),
  });
  current = state(7500);
  release();
  const result = await running;
  assert.equal(result.kind, "current");
  assert.equal(result.profileId, "personal");
  assert.equal(result.sourceText, encodeBackup(captured));
  assert.notEqual(result.sourceText, encodeBackup(current));
});

test("missing and unavailable snapshots reject without inventing a backup", async () => {
  for (const inspection of [
    { status: "missing" },
    { status: "unavailable", reason: "key" },
  ] as const) {
    await assert.rejects(
      captureBackupSource({
        ...capture(state(10000)),
        save: async () => {
          throw new Error("not saved");
        },
        inspect: async () => inspection,
      }),
      /Нет читаемого/,
    );
  }
});

test("rescue source preserves the verified original anchor/date separately from current snapshot bytes", async () => {
  const value = state(10000),
    inspected = readable(value);
  assert.equal(inspected.status, "readable");
  if (inspected.status !== "readable") return;
  const result = await captureBackupSource({
    ...capture(value),
    save: async () => {},
    inspect: async () => ({
      ...inspected,
      recovery: {
        anchorText: "exact bounded original",
        normalizationDate: "2026-09-10",
        normalizationVersion: 1,
        allowance: inspected.snapshotIdentity.sourceFingerprint,
      },
    }),
  });
  assert.equal(result.recovery?.anchorText, "exact bounded original");
  assert.equal(result.recovery?.normalizationDate, "2026-09-10");
  assert.equal(result.sourceText, inspected.sourceText);
});
