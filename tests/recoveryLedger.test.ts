import { test } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createInitialState } from "../src/domain/seed";
import { encodeBackup } from "../src/domain/backup";
import {
  prepareRestoreCandidate,
  restoreCandidateText,
} from "../src/domain/backupRecovery";
import { createPlainLedgerStorage } from "../src/infrastructure/storage/plainLedgerStorage";
import {
  createVault,
  LEGACY_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  type VaultDependencies,
} from "../src/infrastructure/storage/vault";
import { RECOVERY_RECORD_PREFIX } from "../src/infrastructure/storage/recoveryLedger";
import { createExpandedRecoveryFixture } from "./a03Fixtures";

const date = "2026-10-06";
const options = {
  normalizationDate: date,
  normalizationVersion: 1,
  targetDemo: false,
  transportMode: "rescue",
} as const;
const profileId = "profile-a03-test";
function fixture(native = false) {
  const items = new Map<string, string>();
  const secrets = new Map<string, string>();
  let permit: string | null = null;
  let creates = 0,
    mutations = 0;
  const dependencies: VaultDependencies = {
    profileId,
    storage: {
      async getItem(k) {
        return items.get(k) ?? null;
      },
      async setItem(k, v) {
        mutations++;
        items.set(k, v);
      },
      async removeItem(k) {
        mutations++;
        items.delete(k);
      },
    },
    keys: {
      async get(id) {
        return secrets.get(id) ?? null;
      },
      async create() {
        mutations++;
        const id = `key-${++creates}`,
          secret = randomBytes(32).toString("hex");
        secrets.set(id, secret);
        return { id, secret };
      },
      async remove(id) {
        mutations++;
        secrets.delete(id);
      },
    },
    allowances: {
      async get() {
        return permit;
      },
      async set(v) {
        mutations++;
        permit = v;
      },
      async remove() {
        mutations++;
        permit = null;
      },
    },
    cipher: {
      async seal(plain, secret, context) {
        const iv = randomBytes(12),
          cipher = createCipheriv(
            "aes-256-gcm",
            Buffer.from(secret, "hex"),
            iv,
          );
        cipher.setAAD(Buffer.from(context));
        return Buffer.concat([
          iv,
          cipher.update(plain),
          cipher.final(),
          cipher.getAuthTag(),
        ]).toString("base64");
      },
      async open(sealed, secret, context) {
        const bytes = Buffer.from(sealed, "base64"),
          cipher = createDecipheriv(
            "aes-256-gcm",
            Buffer.from(secret, "hex"),
            bytes.subarray(0, 12),
          );
        cipher.setAAD(Buffer.from(context));
        cipher.setAuthTag(bytes.subarray(-16));
        return Buffer.concat([
          cipher.update(bytes.subarray(12, -16)),
          cipher.final(),
        ]).toString();
      },
    },
  };
  const create = () =>
    native
      ? createVault(dependencies)
      : createPlainLedgerStorage(dependencies.storage, profileId);
  return {
    items,
    secrets,
    dependencies,
    create,
    get permit() {
      return permit;
    },
    set permit(value) {
      permit = value;
    },
    get creates() {
      return creates;
    },
    get mutations() {
      return mutations;
    },
  };
}
for (const native of [false, true]) {
  test(`${native ? "vault" : "plain"} inspection is read-only; fresh imported snapshot is fully verified and retry is idempotent`, async () => {
    const f = fixture(native),
      ledger = f.create(),
      state = createInitialState(false, date);
    f.items.set(LEGACY_STORAGE_KEY, encodeBackup(state));
    const before = f.mutations;
    const inspection = await ledger.inspect({ normalizationDate: date });
    assert.equal(inspection.status, "readable");
    assert.equal(f.mutations, before);
    assert.equal(f.creates, 0);
    f.items.clear();
    assert.deepEqual(await ledger.inspect(), { status: "missing" });
    const candidate = prepareRestoreCandidate(encodeBackup(state), options);
    const receipt = await ledger.writeImportedSnapshot(candidate, {
      operationId: "op-1",
    });
    assert.equal(receipt.profileId, profileId);
    assert.deepEqual(await f.create().load(), candidate.state);
    const writes = f.mutations,
      creates = f.creates;
    assert.deepEqual(
      await f
        .create()
        .writeImportedSnapshot(candidate, { operationId: "op-1" }),
      receipt,
    );
    assert.equal(f.mutations, writes);
    assert.equal(f.creates, creates);
    await assert.rejects(
      f.create().writeImportedSnapshot(candidate, { operationId: "op-2" }),
    );
    const other = prepareRestoreCandidate(
      encodeBackup({
        ...state,
        settings: { ...state.settings, name: "другое" },
      }),
      options,
    );
    await assert.rejects(
      f.create().writeImportedSnapshot(other, { operationId: "op-1" }),
    );
    assert.equal(f.mutations, writes);
    const beforeInspect = f.mutations;
    await f.create().inspect();
    assert.equal(f.mutations, beforeInspect);
  });
  test(`${native ? "vault" : "plain"} expanded rescue survives restart, preserves changed current export, shrinks, then loses its exception`, async () => {
    const f = fixture(native),
      big = createExpandedRecoveryFixture();
    const candidate = prepareRestoreCandidate(big.sourceText, options);
    await f
      .create()
      .writeImportedSnapshot(candidate, { operationId: "large-1" });
    const current = prepareRestoreCandidate(candidate, {
      ...options,
      currentSnapshotText: big.editedSnapshotText,
      snapshotDate: big.snapshotDate,
    });
    const ledger = f.create();
    await ledger.save(current.state);
    const inspection = await f.create().inspect();
    assert.equal(inspection.status, "readable");
    if (inspection.status !== "readable") return;
    assert.deepEqual(inspection.state, current.state);
    assert.equal(inspection.sourceText, restoreCandidateText(current));
    assert.equal(inspection.recovery?.anchorText, big.sourceText);
    assert.equal(inspection.importedSnapshot, undefined);
    assert.equal(inspection.state.transactions.at(-1)?.id, "a03-later");
    const exportCandidate = prepareRestoreCandidate(
      inspection.recovery!.anchorText,
      {
        ...options,
        currentSnapshotText: inspection.sourceText,
        snapshotDate: inspection.snapshotDate,
      },
    );
    assert.deepEqual(exportCandidate.state, current.state);
    const committed = new Map(f.items),
      permit = f.permit;
    await ledger.save(current.state);
    const sameSizeEdit = structuredClone(current.state);
    sameSizeEdit.transactions[0].title = "Тост";
    assert.equal(
      Buffer.byteLength(encodeBackup(sameSizeEdit)),
      Buffer.byteLength(encodeBackup(current.state)),
    );
    await assert.rejects(ledger.save(sameSizeEdit), /уменьшать/);
    await assert.rejects(ledger.save(candidate.state), /уменьшать/);
    assert.deepEqual(f.items, committed);
    assert.equal(f.permit, permit);
    const small = createInitialState(false, date);
    await ledger.save(small);
    assert.deepEqual(await f.create().load(), small);
    assert.equal((await f.create().inspect()).status, "readable");
    if (native) assert.equal(f.permit, null);
    await assert.rejects(f.create().save(current.state), /5 МБ/);
    assert.deepEqual(await f.create().load(), small);
  });
  test(`${native ? "vault" : "plain"} rescue save acknowledges the exact committed snapshot after readback or cleanup failure`, async () => {
    const big = createExpandedRecoveryFixture();
    const initial = prepareRestoreCandidate(big.sourceText, options);
    const current = prepareRestoreCandidate(initial, {
      ...options,
      currentSnapshotText: big.editedSnapshotText,
      snapshotDate: big.snapshotDate,
    });
    for (const failure of native ? ["readback", "cleanup"] : ["readback"]) {
      const f = fixture(native),
        ledger = f.create();
      await ledger.writeImportedSnapshot(initial, {
        operationId: `retry-${failure}`,
      });
      const key = native ? VAULT_STORAGE_KEY : LEGACY_STORAGE_KEY;
      const get = f.dependencies.storage.getItem;
      const set = f.dependencies.storage.setItem;
      const remove = f.dependencies.storage.removeItem;
      let writes = 0,
        failed = false;
      f.dependencies.storage.setItem = async (name, value) => {
        await set(name, value);
        if (name === key) writes++;
      };
      f.dependencies.storage.getItem = async (name) => {
        if (failure === "readback" && name === key && writes && !failed) {
          failed = true;
          throw new Error("Injected readback failure after commit");
        }
        return get(name);
      };
      f.dependencies.storage.removeItem = async (name) => {
        if (
          failure === "cleanup" &&
          name === LEGACY_STORAGE_KEY &&
          writes &&
          !failed
        ) {
          failed = true;
          throw new Error("Injected cleanup failure after commit");
        }
        return remove(name);
      };
      await assert.rejects(ledger.save(current.state), /failure after commit/);
      assert.equal(failed, true);
      assert.equal(writes, 1);
      const durable = new Map(f.items),
        permit = f.permit,
        creates = f.creates;
      // Retry in the same queue/process, where lastSaved has not advanced.
      await ledger.save(current.state);
      assert.equal(writes, 1, "an acknowledged retry must not rewrite money");
      assert.equal(f.creates, creates);
      assert.deepEqual(f.items, durable);
      assert.equal(f.permit, permit);
      assert.deepEqual(await f.create().load(), current.state);
    }
  });
}
test("plain recovery recomputes allowance and rejects an edited header or truncated anchor", async () => {
  const f = fixture(),
    candidate = prepareRestoreCandidate(
      encodeBackup(createInitialState(false, date)),
      options,
    );
  await f.create().writeImportedSnapshot(candidate, { operationId: "tamper" });
  const raw = f.items.get(LEGACY_STORAGE_KEY)!;
  const start = RECOVERY_RECORD_PREFIX.length,
    end = raw.indexOf("\n", start),
    header = JSON.parse(raw.slice(start, end));
  header.initialIdentity.allowance.utf8Bytes += 1;
  f.items.set(
    LEGACY_STORAGE_KEY,
    RECOVERY_RECORD_PREFIX + JSON.stringify(header) + raw.slice(end),
  );
  assert.deepEqual(await f.create().inspect(), {
    status: "damaged",
    reason: "rescue-allowance",
  });
  f.items.set(LEGACY_STORAGE_KEY, raw.slice(0, -1));
  assert.deepEqual(await f.create().inspect(), {
    status: "damaged",
    reason: "rescue-allowance",
  });
});
test("native recovery fails closed on absent permit, wrong permit, absent key, ciphertext damage and inaccessible storage", async () => {
  const f = fixture(true),
    candidate = prepareRestoreCandidate(
      encodeBackup(createInitialState(false, date)),
      options,
    );
  await f
    .create()
    .writeImportedSnapshot(candidate, { operationId: "native-1" });
  const raw = f.items.get(VAULT_STORAGE_KEY)!,
    permit = f.permit!,
    key = [...f.secrets.entries()][0];
  f.permit = null;
  assert.deepEqual(await f.create().inspect(), {
    status: "unavailable",
    reason: "rescue-source-required",
  });
  f.permit = permit.replace(
    '"operationId":"native-1"',
    '"operationId":"native-2"',
  );
  assert.deepEqual(await f.create().inspect(), {
    status: "damaged",
    reason: "rescue-allowance",
  });
  f.permit = permit;
  f.secrets.clear();
  assert.deepEqual(await f.create().inspect(), {
    status: "unavailable",
    reason: "key",
  });
  f.secrets.set(...key);
  const envelope = JSON.parse(raw),
    sealed = Buffer.from(envelope.sealed, "base64");
  sealed[14] ^= 1;
  envelope.sealed = sealed.toString("base64");
  f.items.set(VAULT_STORAGE_KEY, JSON.stringify(envelope));
  assert.deepEqual(await f.create().inspect(), {
    status: "unavailable",
    reason: "decryption",
  });
  f.dependencies.storage.getItem = async () => {
    throw new Error("storage unavailable");
  };
  const before = f.mutations;
  assert.deepEqual(await f.create().inspect(), {
    status: "unavailable",
    reason: "storage",
  });
  assert.equal(f.mutations, before);
});
test("native interrupted import retries its original permit/key, never creates a second candidate", async () => {
  const f = fixture(true),
    candidate = prepareRestoreCandidate(
      encodeBackup(createInitialState(false, date)),
      options,
    );
  const original = f.dependencies.storage.setItem;
  f.dependencies.storage.setItem = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(
    f.create().writeImportedSnapshot(candidate, { operationId: "pending-1" }),
    /disk full/,
  );
  assert.equal(f.creates, 1);
  assert.ok(f.permit);
  assert.equal(f.items.size, 0);
  f.dependencies.storage.setItem = original;
  await f
    .create()
    .writeImportedSnapshot(candidate, { operationId: "pending-1" });
  assert.equal(f.creates, 1);
  assert.deepEqual(await f.create().load(), candidate.state);
});
test("readback mismatch never returns a successful import receipt", async () => {
  const f = fixture(),
    candidate = prepareRestoreCandidate(
      encodeBackup(createInitialState(false, date)),
      options,
    );
  const original = f.dependencies.storage.setItem;
  f.dependencies.storage.setItem = async (k, v) => original(k, v + " ");
  await assert.rejects(
    f.create().writeImportedSnapshot(candidate, { operationId: "readback-1" }),
    /проверить запись/,
  );
});
test("native envelope above the historical outer cap requires its verified source-bound permit before decryption", async () => {
  const f = fixture(true),
    state = createInitialState(false, date);
  state.transactions = Array.from({ length: 9000 }, (_, i) => ({
    id: `utf8-${i}`,
    type: "income" as const,
    title: "Тест",
    amount: 100,
    baseAmount: 100,
    date,
    category: "other",
    accountId: "card",
    note: "中".repeat(250),
  }));
  const source = encodeBackup(state);
  assert.ok(
    source.length < 5_000_000 && Buffer.byteLength(source) < 15_000_000,
  );
  const candidate = prepareRestoreCandidate(source, options);
  await f
    .create()
    .writeImportedSnapshot(candidate, { operationId: "large-utf8" });
  assert.ok(f.items.get(VAULT_STORAGE_KEY)!.length > 20_001_000);
  const originalOpen = f.dependencies.cipher.open;
  let opens = 0;
  f.dependencies.cipher.open = (...args) => {
    opens++;
    return originalOpen(...args);
  };
  f.permit = null;
  assert.deepEqual(await f.create().inspect(), {
    status: "unavailable",
    reason: "rescue-source-required",
  });
  assert.equal(opens, 0);
});
