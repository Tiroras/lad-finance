import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProfileRecovery,
  type ProfileRecoveryStorage,
} from "../src/infrastructure/storage/profileRecovery";
import type {
  LedgerInspection,
  VerifiedSnapshotReceipt,
} from "../src/infrastructure/storage/ledgerContracts";
import { createInitialState } from "../src/domain/seed";
import { createPlainLedgerStorage } from "../src/infrastructure/storage/plainLedgerStorage";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  fingerprintText,
  prepareRestoreCandidate,
  type VerifiedRestoreCandidate,
} from "../src/domain/backupRecovery";
import {
  encodeProfileRegistry,
  type FinanceProfile,
} from "../src/domain/profiles";

const today = "2026-10-15";
const custom: FinanceProfile = "profile-11111111-1111-4111-8111-111111111111";
const blocked: FinanceProfile = "profile-22222222-2222-4222-8222-222222222222";
const broken: FinanceProfile = "profile-33333333-3333-4333-8333-333333333333";
const key = (id: FinanceProfile) => `lad-profile-${id}:lad-finance-v1`;
const seed = createInitialState(false, today);
seed.settings.exchange = { automatic: false, rates: {} };
seed.accounts[0].openingBalance = 123456;
const raw = encodeBackup(seed);
const candidate = prepareRestoreCandidate(raw, {
  normalizationDate: today,
  normalizationVersion: 1,
  targetDemo: false,
  transportMode: "standard",
});

function fixture() {
  const metadata = new Map<string, string>();
  const ledgers = new Map<FinanceProfile, string>([
    ["personal", raw],
    [custom, raw],
  ]);
  const secrets = new Map([["synthetic-key", "preserved"]]);
  const receipts = new Map<FinanceProfile, VerifiedSnapshotReceipt>();
  const statuses = new Map<FinanceProfile, LedgerInspection>();
  const events: string[] = [];
  let fail: string | null = null;
  let mismatch: string | null = null;
  let counter = 100;
  const hit = (point: string) => {
    events.push(point);
    if (fail === point) {
      fail = null;
      throw new Error(`injected ${point}`);
    }
  };
  const stage = () => {
    try {
      return JSON.parse(metadata.get("journal") ?? "null")?.stage ?? "none";
    } catch {
      return "invalid";
    }
  };
  const read = async (name: string) => {
    hit(`read:${name}:${name === "journal" ? stage() : "value"}`);
    if (mismatch === name) {
      mismatch = null;
      return "readback-mismatch";
    }
    return metadata.get(name) ?? null;
  };
  const write = async (name: string, value: string | null) => {
    const label =
      name === "journal" && value ? JSON.parse(value).stage : "value";
    hit(`write:${name}:${label}:before`);
    if (value === null) metadata.delete(name);
    else metadata.set(name, value);
    hit(`write:${name}:${label}:after`);
  };
  const storage: ProfileRecoveryStorage = {
    async getAllKeys() {
      hit("keys");
      return [...ledgers.keys()]
        .map(key)
        .concat([
          "lad-finance-v1",
          "lad-profile-invalid:lad-finance-v1",
          "lad-profile-personal:unrelated",
        ]);
    },
    readCatalog: () => read("catalog"),
    writeCatalog: (value) => write("catalog", value),
    readActive: () => read("active"),
    writeActive: (value) => write("active", value),
    readJournal: () => read("journal"),
    writeJournal: (value) => write("journal", value),
    async removeJournal() {
      hit("remove:before");
      metadata.delete("journal");
      hit("remove:after");
    },
  };
  const ledger = (profileId: FinanceProfile) => ({
    async inspect(): Promise<LedgerInspection> {
      hit(`inspect:${profileId}`);
      if (statuses.has(profileId)) return statuses.get(profileId)!;
      const sourceText = ledgers.get(profileId);
      if (sourceText === undefined) return { status: "missing" };
      try {
        return {
          status: "readable",
          state: decodeBackup(sourceText, today),
          sourceText,
          snapshotIdentity: {
            format: "plaintext",
            recordFingerprint: fingerprintText(sourceText),
            sourceFingerprint: fingerprintText(sourceText),
          },
          normalizationDate: today,
          normalizationVersion: 1,
          snapshotDate: today,
          ...(receipts.has(profileId)
            ? { importedSnapshot: receipts.get(profileId)! }
            : {}),
        };
      } catch {
        return { status: "damaged", reason: "financial-json" };
      }
    },
    async writeImportedSnapshot(
      value: VerifiedRestoreCandidate,
      { operationId }: { operationId: string },
    ) {
      // No blank snapshot is ever written. A durable intent must exist before any target write.
      const intent = JSON.parse(metadata.get("journal")!);
      assert.equal(intent.operationId, operationId);
      assert.equal(intent.targetId, profileId);
      assert.equal(intent.kind, "import");
      hit("snapshot:before");
      const sourceText = encodeBackup(value.state);
      ledgers.set(profileId, sourceText);
      const receipt: VerifiedSnapshotReceipt = {
        operationId,
        profileId,
        candidateIdentity: value.identity,
        snapshotIdentity: {
          format: "plaintext",
          recordFingerprint: fingerprintText(sourceText),
          sourceFingerprint: fingerprintText(sourceText),
        },
      };
      receipts.set(profileId, receipt);
      hit("snapshot:after");
      return receipt;
    },
  });
  const restart = (demoEnabled = false) =>
    createProfileRecovery({
      storage,
      ledger,
      demoEnabled,
      createId: () =>
        `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    });
  return {
    metadata,
    ledgers,
    secrets,
    receipts,
    statuses,
    events,
    storage,
    restart,
    failAt: (point: string | null) => {
      fail = point;
    },
    mismatchNext: (name: string) => {
      mismatch = name;
    },
  };
}

test("A01 scan is read-only with missing keys, damaged ledgers, missing personal and partial names", async () => {
  const f = fixture();
  f.ledgers.delete("personal");
  f.ledgers.set(blocked, "encrypted bytes that must remain");
  f.ledgers.set(broken, "damaged bytes that must remain");
  f.statuses.set(blocked, { status: "unavailable", reason: "key" });
  f.metadata.set(
    "catalog",
    JSON.stringify({
      version: 1,
      profiles: [
        { id: custom, name: "Семья" },
        { id: blocked, name: "Семья" },
        { id: broken, name: "\n" },
      ],
    }),
  );
  f.metadata.set("active", custom);
  const before = {
    metadata: new Map(f.metadata),
    ledgers: new Map(f.ledgers),
    secrets: new Map(f.secrets),
  };
  const scan = await f.restart().scan();
  assert.deepEqual(
    scan.entries.map((p) => p.status),
    ["missing", "readable", "unavailable", "damaged"],
  );
  assert.equal(scan.profiles[1].name, "Семья");
  assert.equal(new Set(scan.profiles.map((p) => p.name)).size, 4);
  assert.equal(scan.entries[1].summary?.accounts, 3);
  assert.deepEqual(f.metadata, before.metadata);
  assert.deepEqual(f.ledgers, before.ledgers);
  assert.deepEqual(f.secrets, before.secrets);
  assert.equal(
    f.events.some(
      (e) =>
        e.startsWith("write:") ||
        e.startsWith("remove:") ||
        e.startsWith("snapshot:"),
    ),
    false,
  );
  f.statuses.delete(blocked);
  f.ledgers.set(blocked, raw);
  assert.equal(
    (await f.restart().scan()).entries.find((p) => p.id === blocked)?.status,
    "readable",
  );
});

test("A01 scans include Demo only in the enabled mode and reject enumeration failure without writes", async () => {
  const f = fixture();
  f.ledgers.set("demo", encodeBackup({ ...seed, demo: true }));
  assert.equal(
    (await f.restart().scan()).entries.some((p) => p.id === "demo"),
    false,
  );
  const scan = await f.restart(true).scan();
  assert.equal(scan.entries.find((p) => p.id === "demo")?.status, "readable");
  assert.equal(
    scan.profiles.some((p) => p.id === "demo"),
    false,
  );
  f.failAt("keys");
  await assert.rejects(f.restart().scan(), /injected keys/);
  assert.equal(f.metadata.size, 0);
});

test("A01 confirmed catalog recovery keeps every ledger and key, including unreadable selected data", async () => {
  const f = fixture();
  f.metadata.set("catalog", "broken registry");
  f.metadata.set("active", "personal");
  f.ledgers.set(blocked, "sealed unreadable");
  f.statuses.set(blocked, { status: "unavailable", reason: "key" });
  const originals = new Map(f.ledgers),
    keys = new Map(f.secrets);
  const service = f.restart();
  const preview = await service.scan();
  const journal = await service.prepare(preview, blocked);
  const result = await f.restart().resume(journal.operationId);
  assert.equal(result.inspection.status, "unavailable");
  assert.equal(result.activationPending, false);
  assert.equal(f.metadata.get("active"), blocked);
  assert.deepEqual(f.ledgers, originals);
  assert.deepEqual(f.secrets, keys);
  await f.restart().finish(journal.operationId);
  assert.equal(f.metadata.has("journal"), false);
});

test("A01 stale preview, foreign catalog and corrupt journal fail closed", async () => {
  const f = fixture(),
    service = f.restart();
  const preview = await service.scan();
  f.metadata.set("catalog", "foreign");
  await assert.rejects(service.prepare(preview, custom), /изменился/);
  assert.equal(f.metadata.has("journal"), false);
  const next = await service.scan(),
    journal = await service.prepare(next, custom);
  f.metadata.set("catalog", "third value");
  await assert.rejects(service.resume(journal.operationId), /изменился/);
  assert.equal(f.metadata.get("catalog"), "third value");
  f.metadata.set("journal", "corrupt");
  await assert.rejects(f.restart().readPending(), /журнал/);
  assert.equal(f.metadata.get("catalog"), "third value");
});

const faultPoints = [
  "write:journal:prepared:before",
  "write:journal:prepared:after",
  "read:journal:prepared",
  "snapshot:before",
  "snapshot:after",
  "write:journal:snapshot-verified:before",
  "write:journal:snapshot-verified:after",
  "write:catalog:value:before",
  "write:catalog:value:after",
  "write:journal:catalog-verified:before",
  "write:journal:catalog-verified:after",
  "write:active:value:before",
  "write:active:value:after",
  "remove:before",
  "remove:after",
];
for (const point of faultPoints)
  test(`A01 import resumes after ${point} without duplicate target or loss of other profiles`, async () => {
    const f = fixture();
    const originalRegistry = encodeProfileRegistry([
      { id: "personal", name: "Личный" },
      { id: custom, name: "Другой" },
    ]);
    f.metadata.set("catalog", originalRegistry);
    f.metadata.set("active", custom);
    const oldLedgers = new Map(f.ledgers),
      oldKeys = new Map(f.secrets);
    f.failAt(point);
    let finished = false;
    try {
      const result = await f
        .restart()
        .importCandidate("Проверенная копия", candidate);
      if (!result.activationPending) {
        await f.restart().finish(result.journal.operationId);
        finished = true;
      }
    } catch (error) {
      assert.match(String(error), /injected/);
    }
    assert.ok(f.events.includes(point), point);
    const prior = await f.restart().readPending();
    if (!finished) {
      f.failAt(null);
      const result = await f
        .restart()
        .importCandidate("Проверенная копия", candidate);
      if (prior) {
        assert.equal(result.journal.operationId, prior.operationId);
        assert.equal(result.journal.targetId, prior.targetId);
      }
      await f.restart().finish(result.journal.operationId);
    }
    for (const [id, bytes] of oldLedgers)
      assert.equal(f.ledgers.get(id), bytes);
    assert.deepEqual(f.secrets, oldKeys);
    const profiles = JSON.parse(f.metadata.get("catalog")!).profiles;
    assert.equal(profiles.length, 3);
    assert.equal(f.ledgers.size, 3);
    assert.equal(f.events.filter((e) => e === "snapshot:after").length, 1);
    const imported = f.metadata.get("active") as FinanceProfile;
    assert.deepEqual(
      decodeBackup(f.ledgers.get(imported)!, today),
      candidate.state,
    );
    assert.equal(f.metadata.has("journal"), false);
  });

test("A01 import intent rejects another name or file, and a fresh instance can resume a written snapshot without the file", async () => {
  const f = fixture();
  f.failAt("snapshot:after");
  await assert.rejects(
    f.restart().importCandidate("Копия", candidate),
    /injected/,
  );
  const journal = (await f.restart().readPending())!;
  await assert.rejects(
    f.restart().importCandidate("Другая", candidate),
    /прежним названием/,
  );
  const changed = prepareRestoreCandidate(
    encodeBackup({
      ...seed,
      accounts: seed.accounts.map((a) => ({ ...a, name: a.name + " X" })),
    }),
    {
      normalizationDate: today,
      normalizationVersion: 1,
      targetDemo: false,
      transportMode: "standard",
    },
  );
  await assert.rejects(
    f.restart().importCandidate("Копия", changed),
    /другая копия/,
  );
  const result = await f.restart().resume(journal.operationId);
  assert.equal(result.inspection.status, "readable");
  assert.equal(f.events.filter((e) => e === "snapshot:after").length, 1);
  await f.restart().finish(journal.operationId);
});

test("A01 readback mismatch leaves a recoverable journal and explicit rollback preserves imported bytes", async () => {
  const f = fixture();
  f.metadata.set("catalog", "old broken registry");
  f.metadata.set("active", custom);
  f.failAt("write:journal:catalog-verified:before");
  await assert.rejects(
    f.restart().importCandidate("Копия", candidate),
    /injected/,
  );
  const journal = (await f.restart().readPending())!;
  const bytes = new Map(f.ledgers);
  f.mismatchNext("catalog");
  await assert.rejects(f.restart().resume(journal.operationId), /изменился/);
  f.failAt("write:catalog:value:after");
  await assert.rejects(
    f.restart().restoreOriginal(journal.operationId),
    /injected/,
  );
  assert.equal((await f.restart().readPending())?.stage, "restoring-original");
  await f.restart().restoreOriginal(journal.operationId);
  assert.equal(f.metadata.get("catalog"), "old broken registry");
  assert.equal(f.metadata.get("active"), custom);
  assert.deepEqual(f.ledgers, bytes);
  assert.equal(f.metadata.has("journal"), false);
});

for (const target of ["journal", "catalog"] as const)
  test(`A01 ${target} readback mismatch never acknowledges publication`, async () => {
    const f = fixture();
    const originalJournal = f.storage.writeJournal;
    const originalCatalog = f.storage.writeCatalog;
    let armed = true;
    if (target === "journal")
      f.storage.writeJournal = async (raw) => {
        await originalJournal(raw);
        if (armed) {
          armed = false;
          f.mismatchNext("journal");
        }
      };
    else
      f.storage.writeCatalog = async (raw) => {
        await originalCatalog(raw);
        if (armed) {
          armed = false;
          f.mismatchNext("catalog");
        }
      };
    const before = new Map(f.ledgers);
    await assert.rejects(
      f.restart().importCandidate("Копия", candidate),
      /журнал|изменился/,
    );
    assert.equal(f.metadata.has("active"), false);
    const pending = (await f.restart().readPending())!;
    assert.equal(pending.kind, "import");
    const result = await f.restart().importCandidate("Копия", candidate);
    assert.equal(result.journal.operationId, pending.operationId);
    assert.equal(result.journal.targetId, pending.targetId);
    await f.restart().finish(pending.operationId);
    for (const [id, bytes] of before) assert.equal(f.ledgers.get(id), bytes);
    assert.equal(f.events.filter((e) => e === "snapshot:after").length, 1);
  });

test("A01 real plain ledger readback resumes a staged import without rewriting the snapshot", async () => {
  const f = fixture();
  const bytes = new Map<string, string>([
    [key("personal"), raw],
    [key(custom), raw],
  ]);
  let ledgerWrites = 0;
  let next = 800;
  const make = () =>
    createProfileRecovery({
      storage: {
        ...f.storage,
        getAllKeys: async () => [...bytes.keys()],
      },
      demoEnabled: false,
      createId: () =>
        `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
      ledger: (profile) =>
        createPlainLedgerStorage(
          {
            getItem: async (suffix) =>
              bytes.get(`lad-profile-${profile}:${suffix}`) ?? null,
            setItem: async (suffix, content) => {
              ledgerWrites++;
              bytes.set(`lad-profile-${profile}:${suffix}`, content);
            },
          },
          profile,
        ),
    });
  f.failAt("write:catalog:value:before");
  await assert.rejects(make().importCandidate("Копия", candidate), /injected/);
  const pending = (await make().readPending())!;
  const committedBytes = bytes.get(key(pending.targetId));
  assert.ok(committedBytes);
  assert.equal(ledgerWrites, 1);
  const resumed = await make().resume(pending.operationId);
  assert.equal(resumed.inspection.status, "readable");
  if (resumed.inspection.status === "readable")
    assert.deepEqual(resumed.inspection.state, candidate.state);
  assert.equal(bytes.get(key(pending.targetId)), committedBytes);
  assert.equal(ledgerWrites, 1);
  assert.equal(bytes.get(key("personal")), raw);
  assert.equal(bytes.get(key(custom)), raw);
  await make().finish(pending.operationId);
});
