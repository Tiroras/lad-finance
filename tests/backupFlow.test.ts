import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as backupDomain from "../src/domain/backup";
import * as measurement from "../src/domain/backupMeasurement";
import * as recovery from "../src/domain/backupRecovery";
import * as finance from "../src/domain/finance";
import { createInitialState } from "../src/domain/seed";
import type { BackupSourceResult } from "../src/state/finance/backupSource";
import { backupCrypto } from "../src/infrastructure/crypto/backupCrypto";
import * as passwordBackup from "../src/infrastructure/crypto/passwordBackup";
import * as rescueArchive from "../src/infrastructure/crypto/rescueArchive";
import * as fingerprints from "../src/infrastructure/files/backupFingerprint";
import type { BackupDocument } from "../src/infrastructure/files/backupDocumentReader";
import { createExpandedRecoveryFixture } from "./a03Fixtures";

const date = "2026-10-15";
const password = "Синтетический пароль 2026";
type Flow = Pick<
  typeof import("../src/features/data-transfer/lib/backup"),
  "pickBackup" | "prepareBackup" | "sharePreparedBackup"
>;

function harness() {
  const state = {
    document: null as BackupDocument | null,
    derives: 0,
    shares: [] as {
      parts: readonly Uint8Array[];
      name: string;
      mimeType: string;
    }[],
  };
  const modules: Record<string, unknown> = {
    "../../../domain/backup": backupDomain,
    "../../../domain/backupMeasurement": measurement,
    "../../../domain/backupRecovery": recovery,
    "../../../domain/finance": { ...finance, localDate: () => date },
    "../../../infrastructure/files/backupDocument": {
      pickBackupDocument: async () => state.document,
    },
    "../../../infrastructure/files/backupFingerprint": fingerprints,
    "../../../infrastructure/files/shareFile": {
      shareFile: async (
        parts: readonly Uint8Array[],
        name: string,
        mimeType: string,
      ) => {
        state.shares.push({ parts, name, mimeType });
      },
    },
    "../../../infrastructure/crypto/backupCrypto": {
      backupCrypto: {
        ...backupCrypto,
        async derive(...args: Parameters<typeof backupCrypto.derive>) {
          state.derives++;
          return backupCrypto.derive(...args);
        },
      },
    },
    "../../../infrastructure/crypto/passwordBackup": passwordBackup,
    "../../../infrastructure/crypto/rescueArchive": rescueArchive,
  };
  const filename = new URL(
    "../src/features/data-transfer/lib/backup.ts",
    import.meta.url,
  );
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const flow = {} as Flow;
  runInNewContext(
    source,
    {
      exports: flow,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      require(name: string) {
        assert.ok(name in modules, `Unexpected backup flow import: ${name}`);
        return modules[name];
      },
    },
    { filename: filename.pathname },
  );
  return { state, flow };
}

function document(parts: readonly Uint8Array[], name: string) {
  const bytes = new Uint8Array(Buffer.concat(parts));
  const activity = { reads: [] as [number, number][], closed: 0 };
  const value: BackupDocument = {
    name,
    size: bytes.length,
    async read(offset, length) {
      assert.equal(activity.closed, 0, "read after close");
      activity.reads.push([offset, length]);
      return bytes.slice(offset, offset + length);
    },
    close() {
      activity.closed++;
    },
  };
  return { bytes, value, activity };
}

function source(
  sourceText: string,
  patch: Partial<BackupSourceResult> = {},
): BackupSourceResult {
  const fingerprint = measurement.fingerprintText(sourceText);
  return {
    kind: "current",
    profileId: "personal",
    profileName: "Синтетика",
    capturedRevision: 7,
    sourceRevision: 7,
    sourceText,
    normalizationDate: date,
    normalizationVersion: 1,
    snapshotDate: date,
    snapshotIdentity: {
      format: "plaintext",
      recordFingerprint: fingerprint,
      sourceFingerprint: fingerprint,
    },
    ...patch,
  } as BackupSourceResult;
}
const exactFingerprint = (bytes: Uint8Array) => ({
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteLength: bytes.length,
});

test("feature ordinary JSON exports, picks and fingerprints exactly the validated bytes, then shares only prepared parts", async () => {
  const { state, flow } = harness();
  const original = createInitialState(false, date);
  original.settings.name = "Обычный JSON";
  const prepared = await flow.prepareBackup(source(JSON.stringify(original)));
  assert.match(prepared.name, /\.json$/);
  assert.equal(prepared.encrypted, false);
  const selected = document(prepared.parts, prepared.name);
  state.document = selected.value;
  const picked = await flow.pickBackup();
  assert.equal(picked?.kind, "open");
  if (picked?.kind !== "open") throw new Error("Expected JSON");
  assert.deepEqual(picked.backup.candidate.state, original);
  assert.deepEqual(picked.backup.fingerprint, exactFingerprint(selected.bytes));
  assert.deepEqual(prepared.fingerprint, picked.backup.fingerprint);
  assert.equal(selected.activity.closed, 1);
  assert.equal(state.derives, 0);
  await flow.sharePreparedBackup(prepared);
  assert.equal(state.shares.length, 1);
  assert.equal(state.shares[0].parts, prepared.parts);
  assert.equal(state.shares[0].name, prepared.name);
});

test("feature v1 keeps original Demo information, retries wrong passwords and closes the physical selection before holding encrypted text", async () => {
  const { state, flow } = harness();
  const demo = createInitialState(true, date);
  const prepared = await flow.prepareBackup(
    source(JSON.stringify(demo), { profileId: "demo" }),
    password,
  );
  assert.match(prepared.name, /\.ladbackup$/);
  assert.equal(
    JSON.parse(new TextDecoder().decode(prepared.parts[0])).version,
    1,
  );
  const selected = document(prepared.parts, prepared.name);
  state.document = selected.value;
  const picked = await flow.pickBackup();
  if (picked?.kind !== "encrypted")
    throw new Error("Expected password selection");
  assert.equal(selected.activity.closed, 1);
  await assert.rejects(
    picked.selection.unlock("wrong password"),
    /Пароль неверный/,
  );
  const verified = await picked.selection.unlock(password);
  assert.equal(verified.candidate.sourceDemo, true);
  assert.equal(JSON.parse(verified.candidate.sourceText).demo, true);
  assert.equal(verified.candidate.state.demo, false);
  assert.deepEqual(verified.fingerprint, exactFingerprint(selected.bytes));
  picked.selection.close();
  await assert.rejects(picked.selection.unlock(password), /ещё раз/);
  assert.equal(state.derives, 3); // Export, wrong password, successful retry.
});

test("feature rescue uses lazy validated ranges, retains selection for retry and fingerprints the actual ciphertext", async () => {
  const { state, flow } = harness();
  const text = JSON.stringify(createInitialState(false, date));
  const parts = await rescueArchive.writeRescueArchive(
    {
      sourceText: text,
      currentSnapshotText: text,
      normalizationDate: date,
      normalizationVersion: 1,
      snapshotDate: date,
    },
    { password, crypto: backupCrypto },
  );
  assert.equal(rescueArchive.isRescueArchivePrefix(parts[0]), true);
  const selected = document(parts, "synthetic.ladbackup");
  state.document = selected.value;
  const picked = await flow.pickBackup();
  if (picked?.kind !== "encrypted")
    throw new Error("Expected rescue password selection");
  assert.equal(selected.activity.closed, 0);
  assert.equal(
    selected.activity.reads.some(
      ([, length]) => length === selected.bytes.length,
    ),
    false,
  );
  await assert.rejects(
    picked.selection.unlock("wrong password"),
    /Пароль неверный/,
  );
  assert.equal(selected.activity.closed, 0);
  const verified = await picked.selection.unlock(password);
  assert.deepEqual(verified.fingerprint, exactFingerprint(selected.bytes));
  assert.equal(verified.candidate.sourceText, text);
  assert.equal(verified.candidate.currentSnapshotText, text);
  assert.deepEqual(
    selected.activity.reads.slice(-4).map(([, length]) => length),
    parts.map((part) => part.length),
  );
  picked.selection.close();
  assert.equal(selected.activity.closed, 1);
});

test("feature exports a reduced recovery snapshot as ordinary JSON or v1 without retaining an unnecessary rescue container", async () => {
  const { flow } = harness();
  const text = JSON.stringify(createInitialState(false, date));
  const candidate = recovery.prepareRestoreCandidate(text, {
    normalizationDate: date,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: "rescue",
  });
  const recovered = source(text, {
    recovery: {
      anchorText: text,
      normalizationDate: date,
      normalizationVersion: 1,
      allowance: candidate.identity.allowance,
    },
  });
  const plain = await flow.prepareBackup(recovered);
  assert.match(plain.name, /\.json$/);
  assert.equal(rescueArchive.isRescueArchivePrefix(plain.parts[0]), false);
  assert.deepEqual(
    JSON.parse(Buffer.concat(plain.parts).toString()),
    JSON.parse(text),
  );
  const encrypted = await flow.prepareBackup(recovered, password);
  assert.match(encrypted.name, /\.ladbackup$/);
  const raw = Buffer.concat(encrypted.parts).toString();
  assert.equal(JSON.parse(raw).version, 1);
  assert.deepEqual(
    JSON.parse(
      await passwordBackup.decryptBackupSource(raw, password, backupCrypto),
    ),
    JSON.parse(text),
  );
});

test("feature fingerprint is computed from the same rescue bytes that were validated, without a second read of a mutable file", async () => {
  const { state, flow } = harness();
  const original = createInitialState(false, date);
  original.settings.name = "Проверенные байты";
  const text = JSON.stringify(original);
  const parts = await rescueArchive.writeRescueArchive({
    sourceText: text,
    currentSnapshotText: text,
    normalizationDate: date,
    normalizationVersion: 1,
    snapshotDate: date,
  });
  const selected = document(parts, "mutable.ladrescue");
  const expected = exactFingerprint(selected.bytes);
  const snapshotOffset = parts
    .slice(0, 3)
    .reduce((sum, part) => sum + part.length, 0);
  const read = selected.value.read;
  let currentReads = 0;
  selected.value.read = async (offset, length) => {
    const bytes = await read(offset, length);
    if (offset === snapshotOffset) {
      currentReads++;
      selected.bytes.fill(0); // Any subsequent pass observes different bytes.
    }
    return bytes;
  };
  state.document = selected.value;
  const picked = await flow.pickBackup();
  if (picked?.kind !== "open") throw new Error("Expected rescue");
  assert.equal(
    picked.backup.candidate.state.settings.name,
    original.settings.name,
  );
  assert.deepEqual(picked.backup.fingerprint, expected);
  assert.equal(currentReads, 1);
  assert.equal(selected.activity.closed, 1);
});

test("feature rejects oversized ordinary files and invalid rescue headers before reading their payload or deriving keys", async () => {
  const { state, flow } = harness();
  const huge = document(
    [new TextEncoder().encode('{"version":4}')],
    "huge.json",
  );
  huge.value.size = recovery.MAX_RESCUE_SOURCE_BYTES + 1;
  state.document = huge.value;
  await assert.rejects(flow.pickBackup(), /15 МБ/);
  assert.deepEqual(huge.activity.reads, [[0, 12]]);
  assert.equal(huge.activity.closed, 1);
  const prefix = new Uint8Array(12);
  prefix.set(new TextEncoder().encode(rescueArchive.RESCUE_ARCHIVE_MAGIC));
  new DataView(prefix.buffer).setUint32(
    8,
    rescueArchive.MAX_RESCUE_HEADER_BYTES + 1,
    false,
  );
  const invalid = document([prefix], "invalid.ladbackup");
  state.document = invalid.value;
  await assert.rejects(flow.pickBackup(), /формат/);
  assert.deepEqual(invalid.activity.reads, [
    [0, 12],
    [0, 12],
  ]);
  assert.equal(invalid.activity.closed, 1);
  assert.equal(state.derives, 0);
  state.document = null;
  assert.equal(await flow.pickBackup(), null);
});

test("feature enforces today's financial rules after reproducible archive decoding without rejecting a future header date alone", async () => {
  const { state, flow } = harness();
  const tomorrow = "2026-10-16";
  for (const transactionDate of [date, tomorrow]) {
    const account = createInitialState(false, date);
    account.transactions = [
      {
        id: "date-boundary",
        type: "income",
        title: "Поступление",
        amount: 100,
        date: transactionDate,
        category: "other",
        accountId: "card",
      },
    ];
    const text = JSON.stringify(account);
    const parts = await rescueArchive.writeRescueArchive({
      sourceText: text,
      currentSnapshotText: text,
      normalizationDate: tomorrow,
      snapshotDate: tomorrow,
      normalizationVersion: 1,
    });
    const selected = document(parts, "date-boundary.ladrescue");
    state.document = selected.value;
    if (transactionDate === tomorrow) await assert.rejects(flow.pickBackup());
    else {
      const picked = await flow.pickBackup();
      assert.equal(picked?.kind, "open");
    }
    assert.equal(selected.activity.closed, 1);
    assert.equal(state.shares.length, 0);
  }
});

test("feature rescue export of a changed expanded snapshot preserves the later operation and still includes its original anchor", async () => {
  const { state, flow } = harness();
  const expanded = createExpandedRecoveryFixture();
  const anchor = recovery.prepareRestoreCandidate(expanded.sourceText, {
    normalizationDate: expanded.normalizationDate,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: "rescue",
  });
  const first = await flow.prepareBackup(
    source(expanded.sourceText, {
      normalizationDate: expanded.normalizationDate,
      snapshotDate: expanded.normalizationDate,
    }),
  );
  assert.match(first.name, /\.ladrescue$/);
  const edited = await flow.prepareBackup(
    source(expanded.editedSnapshotText, {
      normalizationDate: expanded.normalizationDate,
      snapshotDate: expanded.snapshotDate,
      recovery: {
        anchorText: expanded.sourceText,
        normalizationDate: expanded.normalizationDate,
        normalizationVersion: 1,
        allowance: anchor.identity.allowance,
      },
    }),
  );
  assert.notEqual(first.fingerprint.sha256, edited.fingerprint.sha256);
  assert.match(edited.name, /\.ladrescue$/);
  const selected = document(edited.parts, edited.name);
  state.document = selected.value;
  const picked = await flow.pickBackup();
  if (picked?.kind !== "open") throw new Error("Expected open rescue");
  assert.equal(picked.backup.candidate.sourceText, expanded.sourceText);
  assert.deepEqual(
    picked.backup.candidate.state,
    backupDomain.validateBackupValue(
      JSON.parse(expanded.editedSnapshotText),
      expanded.snapshotDate,
    ),
  );
  assert.equal(
    picked.backup.candidate.state.transactions.at(-1)?.id,
    "a03-later",
  );
  assert.equal(
    picked.backup.candidate.state.transactions.at(-1)?.date,
    expanded.snapshotDate,
  );
  assert.deepEqual(picked.backup.fingerprint, exactFingerprint(selected.bytes));
  assert.equal(selected.activity.closed, 1);
});
