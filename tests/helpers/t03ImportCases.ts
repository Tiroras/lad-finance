import { appendTransaction } from "../../src/domain/actions/transactions";
import {
  assertBackupSize,
  encodeBackup,
  validateBackupValue,
} from "../../src/domain/backup";
import {
  fingerprintFinanceState,
  sameFingerprint,
  type ContentFingerprint,
} from "../../src/domain/backupRecovery";
import { buildReplacementImportSummary } from "../../src/domain/dataTransfer";
import type { FinanceProfile } from "../../src/domain/profiles";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState } from "../../src/domain/types";
import type { LedgerInspection } from "../../src/infrastructure/storage/ledgerContracts";
import { createPlainLedgerStorage } from "../../src/infrastructure/storage/plainLedgerStorage";
import {
  createImportController,
  type CommitImportInput,
  type ImportContext,
} from "../../src/state/finance/importController";
import { createSaveQueue } from "../../src/state/finance/saveQueue";

const date = "2025-02-28";
const other: FinanceProfile = "profile-11111111-1111-4111-8111-111111111111";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  check(Object.is(actual, expected), message);
}
async function rejects(task: Promise<unknown>, message: string) {
  try {
    await task;
  } catch {
    return;
  }
  throw new Error(message);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function snapshots() {
  const initial = createInitialState(false, date);
  initial.accounts[0].openingBalance = 1_000_000;
  const add = (state: FinanceState, id: string, amount: number) =>
    appendTransaction(
      state,
      {
        id,
        type: "expense",
        title: `Синтетический ${id}`,
        accountId: "card",
        category: "other",
        amount,
        date,
      },
      date,
    );
  const s0 = validateBackupValue(initial, date);
  const s1 = validateBackupValue(add(s0, "t03-first", 70_000), date);
  const s2 = validateBackupValue(add(s1, "t03-later", 30_000), date);
  return { s0, s1, s2 };
}
type Write = {
  profile: FinanceProfile;
  state: FinanceState;
  strategy: "save" | "recover";
};
function harness(ready = true) {
  const { s0, s1, s2 } = snapshots();
  const raw = new Map<FinanceProfile, string>([
    ["personal", encodeBackup(s0)],
    [other, encodeBackup(s0)],
  ]);
  const acknowledged = new Map<FinanceProfile, FinanceState>([
    ["personal", s0],
    [other, s0],
  ]);
  const ledgers = new Map<
    FinanceProfile,
    ReturnType<typeof createPlainLedgerStorage>
  >();
  const context: ImportContext = {
    profileId: "personal",
    profileName: "Синтетический",
    state: s0,
    revision: 0,
    validationDate: date,
    ready,
  };
  const writes: Write[] = [];
  const reads: { profile: FinanceProfile; date: string }[] = [];
  const activations: {
    profile: FinanceProfile;
    state: FinanceState;
    allowance?: ContentFingerprint;
    reason: string;
  }[] = [];
  const stats = {
    applies: 0,
    installs: 0,
    preparations: 0,
    flushes: 0,
    invalidations: 0,
    busy: false,
  };
  const faults: {
    write?: (write: Write, persist: () => Promise<void>) => Promise<void>;
    inspect?: (inspection: LedgerInspection) => LedgerInspection;
    validate?: () => void;
    activate?: () => void;
  } = {};
  const ledger = (profile: FinanceProfile) => {
    let value = ledgers.get(profile);
    if (!value) {
      value = createPlainLedgerStorage(
        {
          async getItem() {
            return raw.get(profile) ?? null;
          },
          async setItem(_key, content) {
            raw.set(profile, content);
          },
        },
        profile,
      );
      ledgers.set(profile, value);
    }
    return value;
  };
  const write = async (entry: Write) => {
    writes.push(entry);
    const persist = () => ledger(entry.profile)[entry.strategy](entry.state);
    if (faults.write) await faults.write(entry, persist);
    else await persist();
  };
  const queue = createSaveQueue<{
    profile: FinanceProfile;
    state: FinanceState;
  }>(
    async (entry) => {
      if (acknowledged.get(entry.profile) === entry.state) return;
      await write({ ...entry, strategy: "save" });
      acknowledged.set(entry.profile, entry.state);
    },
    () => undefined,
  );
  const controller = createImportController({
    context: () => ({ ...context }),
    acquireOperation() {
      if (stats.busy) throw new Error("busy");
      stats.busy = true;
      return () => {
        stats.busy = false;
      };
    },
    validateNext(next) {
      faults.validate?.();
      check(
        next.demo === (context.profileId === "demo"),
        "wrong profile before apply",
      );
      return assertBackupSize(encodeBackup(next));
    },
    installApplied(next) {
      stats.installs++;
      context.state = next;
      return ++context.revision;
    },
    flush: () => {
      stats.flushes++;
      return queue.flush();
    },
    async prepareRecovery(captured) {
      stats.preparations++;
      if (captured.ready)
        queue.enqueue({ profile: captured.profileId, state: captured.state });
      await queue.flush();
      if (
        captured.ready &&
        acknowledged.get(captured.profileId) !== captured.state
      )
        throw new Error("old profile save failed");
    },
    async save(profile, state, strategy) {
      if (strategy === "recover") {
        await write({ profile, state, strategy });
        return true;
      }
      queue.enqueue({ profile, state });
      await queue.flush();
      return acknowledged.get(profile) === state;
    },
    async inspect(profile, validationDate) {
      reads.push({ profile, date: validationDate });
      const inspected = await ledger(profile).inspect({
        normalizationDate: validationDate,
      });
      return faults.inspect?.(inspected) ?? inspected;
    },
    invalidateAcknowledgement(profile) {
      stats.invalidations++;
      acknowledged.delete(profile);
    },
    acknowledge(profile, state) {
      acknowledged.set(profile, state);
    },
    activate(profile, state, allowance, reason) {
      faults.activate?.();
      activations.push({ profile, state, allowance, reason });
      context.profileId = profile;
      context.state = state;
      context.ready = true;
      return ++context.revision;
    },
    nowIso: () => "2025-02-28T12:00:00.000Z",
  });
  const input = (id = "import-1", next = s1): CommitImportInput => ({
    operationId: id,
    expectedProfileId: context.profileId,
    format: "csv",
    mode: "add",
    apply(current, today) {
      stats.applies++;
      return {
        state: next,
        summary: buildReplacementImportSummary(current, next, today),
      };
    },
  });
  const recover = (id = "recover-1", target: FinanceProfile = "personal") =>
    controller.recover({
      operationId: id,
      profileId: target,
      profileName: "Синтетический",
      format: "json",
      prepare(captured) {
        stats.applies++;
        return {
          state: s1,
          summary: buildReplacementImportSummary(
            captured.ready && captured.profileId === target
              ? captured.state
              : null,
            s1,
            captured.validationDate,
          ),
        };
      },
    });
  return {
    controller,
    context,
    stats,
    faults,
    writes,
    reads,
    activations,
    raw,
    acknowledged,
    queue,
    input,
    recover,
    ledger,
    s0,
    s1,
    s2,
  };
}
function snapshotEqual(
  actual: FinanceState,
  expected: FinanceState,
  message: string,
) {
  check(
    sameFingerprint(
      fingerprintFinanceState(actual),
      fingerprintFinanceState(expected),
    ),
    message,
  );
}

/** Runs unchanged in Chromium; the Node wrapper is only an additional future entry. */
export const t03ImportCases: readonly {
  name: string;
  run: () => void | Promise<void>;
}[] = [
  {
    name: "T03 commits normalized exact S1 and detached financial summary",
    async run() {
      const h = harness();
      const result = await h.controller.commit(h.input());
      equal(result.status, "confirmed", "readback must confirm");
      equal(h.stats.applies, 1, "apply once");
      equal(h.stats.installs, 1, "install once");
      equal(h.writes.length, 1, "one financial write");
      equal(h.reads.length, 1, "readonly proof required");
      equal(
        result.summary.before?.balances[0].balance,
        1_000_000,
        "before balance",
      );
      equal(result.summary.after.balances[0].balance, 930_000, "after balance");
      equal(result.summary.after.counts.transactions, 1, "after count");
      snapshotEqual(h.context.state, h.s1, "whole memory snapshot");
      check(
        sameFingerprint(
          result.snapshotFingerprint,
          fingerprintFinanceState(h.s1),
        ),
        "whole receipt",
      );
      const disk = await h
        .ledger("personal")
        .inspect({ normalizationDate: date });
      check(disk.status === "readable", "readable disk");
      snapshotEqual(disk.state, h.s1, "whole persisted snapshot");
      equal(
        h.controller.getView().pendingImportId,
        null,
        "barrier cleared after proof",
      );
    },
  },
  {
    name: "T03 application validates latest state and captured profile before IO",
    async run() {
      const h = harness();
      const stale = h.input();
      h.context.profileId = other;
      await rejects(h.controller.commit(stale), "stale profile must reject");
      equal(h.stats.applies, 0, "wrong profile does not apply");
      equal(h.writes.length, 0, "wrong profile does not write");
      h.context.profileId = "personal";
      h.context.state = h.s1;
      const latest = h.input("latest", h.s2);
      latest.apply = (current, today) => {
        equal(current, h.s1, "apply receives current state, not form snapshot");
        return {
          state: h.s2,
          summary: buildReplacementImportSummary(current, h.s2, today),
        };
      };
      const result = await h.controller.commit(latest);
      equal(
        result.summary.before?.counts.transactions,
        1,
        "summary uses latest state",
      );
      equal(
        result.summary.after.counts.transactions,
        2,
        "latest state preserved",
      );
    },
  },
  {
    name: "T03 invalid links and size failure leave memory and disk untouched",
    async run() {
      for (const kind of ["links", "size"] as const) {
        const h = harness();
        const invalid =
          kind === "links"
            ? {
                ...h.s1,
                transactions: h.s1.transactions.map((t) => ({
                  ...t,
                  accountId: "absent",
                })),
              }
            : h.s1;
        if (kind === "size")
          h.faults.validate = () => {
            throw new Error("size");
          };
        await rejects(
          h.controller.commit(h.input(kind, invalid)),
          "preapply validation must reject",
        );
        equal(h.context.state, h.s0, "memory unchanged");
        equal(h.stats.installs, 0, "nothing installed");
        equal(h.writes.length, 0, "nothing written");
        equal(
          h.controller.getView().importResults.length,
          0,
          "not presented as applied",
        );
        equal(h.stats.busy, false, "short operation released");
      }
    },
  },
  {
    name: "T03 preapply failure allows the same intent after correction without an earlier write",
    async run() {
      const h = harness();
      const input = h.input();
      h.stats.busy = true;
      await rejects(
        h.controller.commit(input),
        "busy operation rejects before apply",
      );
      equal(h.stats.applies, 0, "busy attempt did not apply");
      h.stats.busy = false;
      h.faults.validate = () => {
        throw new Error("size validation failed");
      };
      await rejects(
        h.controller.commit(input),
        "validation rejects before installation",
      );
      equal(h.writes.length, 0, "preapply attempts cannot write");
      equal(h.context.state, h.s0, "preapply attempts cannot replace memory");
      h.faults.validate = undefined;
      const result = await h.controller.commit(input);
      equal(result.status, "confirmed", "same corrected intent can succeed");
      equal(h.stats.installs, 1, "only successful attempt installs");
      equal(h.writes.length, 1, "only successful attempt writes");
    },
  },
  {
    name: "T03 same ID joins in-flight attempt and never reapplies after later S2/profile switch",
    async run() {
      const h = harness(),
        gate = deferred(),
        started = deferred();
      h.faults.write = async (_entry, persist) => {
        started.resolve();
        await gate.promise;
        await persist();
      };
      const input = h.input();
      const first = h.controller.commit(input);
      await started.promise;
      equal(
        h.controller.getView().busyImportId,
        input.operationId,
        "saving state exposed",
      );
      const joined = h.controller.commit(input);
      equal(joined, first, "same ID shares first promise");
      await rejects(
        h.controller.commit(h.input("another")),
        "second import blocked",
      );
      gate.resolve();
      const result = await first;
      await joined;
      equal(h.stats.applies, 1, "no second apply");
      h.context.state = h.s2;
      h.context.revision++;
      h.context.profileId = other;
      const writes = h.writes.length,
        reads = h.reads.length;
      equal(await h.controller.commit(input), result, "old ID returns receipt");
      equal(
        await h.controller.retry(input.operationId),
        result,
        "old retry returns receipt",
      );
      equal(
        await h.controller.openDeviceSnapshot(input.operationId),
        result,
        "old escape returns receipt",
      );
      equal(h.context.state, h.s2, "old result cannot overwrite S2");
      equal(h.context.profileId, other, "old result cannot switch profile");
      equal(h.writes.length, writes, "terminal retry has no writes");
      equal(h.reads.length, reads, "terminal retry has no reads");
      equal(
        result.summary.after.counts.transactions,
        1,
        "S1 summary remains historical",
      );
    },
  },
  {
    name: "T03 active older save completes before imported S1 and cannot acknowledge it",
    async run() {
      const h = harness(),
        gate = deferred(),
        started = deferred();
      const older = validateBackupValue(
        {
          ...h.s0,
          settings: { ...h.s0.settings, name: "Синтетический старый" },
        },
        date,
      );
      h.faults.write = async (entry, persist) => {
        if (entry.state === older) {
          started.resolve();
          await gate.promise;
          throw new Error("older save failed");
        }
        await persist();
      };
      h.queue.enqueue({ profile: "personal", state: older });
      await started.promise;
      const pending = h.controller.commit(h.input());
      equal(
        h.acknowledged.get("personal"),
        h.s0,
        "old acknowledgement remains S0",
      );
      gate.resolve();
      const result = await pending;
      equal(result.status, "confirmed", "new S1 survives older failure");
      equal(h.writes.length, 2, "queue performs old then S1");
      equal(h.writes[0].state, older, "old write first");
      snapshotEqual(h.writes[1].state, h.s1, "S1 second");
      equal(
        h.acknowledged.get("personal"),
        h.context.state,
        "exact S1 acknowledged",
      );
    },
  },
  {
    name: "T03 failed write keeps pending receipt through UI unsubscribe and retries once",
    async run() {
      const h = harness();
      let notifications = 0;
      const unsubscribe = h.controller.subscribe(() => notifications++);
      h.faults.write = async () => {
        throw new Error("synthetic before-write failure");
      };
      const input = h.input();
      const result = await h.controller.commit(input);
      equal(result.status, "applied-unconfirmed", "failed save not success");
      check(
        result.appliedAt && result.appliedRevision === 1,
        "memory application is explicit",
      );
      snapshotEqual(h.context.state, h.s1, "S1 stays in memory");
      equal(h.raw.get("personal"), encodeBackup(h.s0), "device remains S0");
      unsubscribe();
      check(notifications > 0, "subscribers saw result");
      equal(
        h.controller.getView().pendingImportId,
        input.operationId,
        "close does not clear barrier",
      );
      equal(
        await h.controller.commit(input),
        result,
        "duplicate does not retry implicitly",
      );
      equal(h.writes.length, 1, "duplicate has no IO");
      h.faults.write = undefined;
      const retried = await h.controller.retry(input.operationId);
      equal(retried.status, "confirmed", "explicit retry confirms");
      equal(h.stats.applies, 1, "retry does not reapply");
      equal(h.stats.installs, 1, "retry does not install twice");
      equal(h.writes.length, 2, "exactly one explicit second write");
      equal(
        h.controller.getView().importResults.length,
        1,
        "same receipt updated",
      );
    },
  },
  {
    name: "T03 commit then reject confirms by reread without a second write",
    async run() {
      const h = harness();
      h.faults.write = async (_entry, persist) => {
        await persist();
        throw new Error("synthetic ambiguous acknowledgement");
      };
      const result = await h.controller.commit(h.input());
      equal(
        result.status,
        "applied-unconfirmed",
        "ambiguous write is not success",
      );
      equal(h.acknowledged.get("personal"), h.s0, "no false lastSaved");
      const retried = await h.controller.retry(result.id);
      equal(retried.status, "confirmed", "readonly retry finds S1");
      equal(h.writes.length, 1, "no repeated financial write");
      equal(h.stats.invalidations, 0, "matching proof needs no forced save");
      equal(h.reads.length, 1, "one readonly retry proof");
    },
  },
  {
    name: "T03 mismatching readback invalidates lastSaved before explicit retry",
    async run() {
      const h = harness();
      h.faults.write = async () => {
        h.raw.set("personal", encodeBackup(h.s0));
      };
      const result = await h.controller.commit(h.input());
      equal(
        result.status,
        "applied-unconfirmed",
        "acknowledgement alone cannot confirm",
      );
      equal(
        h.acknowledged.get("personal"),
        h.context.state,
        "writer cache claims S1",
      );
      h.faults.write = undefined;
      const retried = await h.controller.retry(result.id);
      equal(retried.status, "confirmed", "retry forces actual S1 write");
      equal(h.stats.invalidations, 1, "stale acknowledgement invalidated");
      equal(h.writes.length, 2, "lastSaved optimization cannot skip retry");
    },
  },
  {
    name: "T03 missing, invalid-link, wrong-profile and equal-count changed snapshots never prove S1",
    async run() {
      for (const kind of ["missing", "links", "profile", "changed"] as const) {
        const h = harness();
        h.faults.write = async (_entry, persist) => {
          await persist();
          if (kind === "missing") h.raw.delete("personal");
          else {
            const changed =
              kind === "links"
                ? {
                    ...h.s1,
                    transactions: h.s1.transactions.map((t) => ({
                      ...t,
                      accountId: "absent",
                    })),
                  }
                : kind === "profile"
                  ? { ...h.s1, demo: true }
                  : {
                      ...h.s1,
                      transactions: h.s1.transactions.map((t) => ({
                        ...t,
                        title: "Другая синтетическая запись",
                      })),
                    };
            h.raw.set("personal", encodeBackup(changed));
          }
        };
        const result = await h.controller.commit(h.input(kind));
        equal(result.status, "applied-unconfirmed", `${kind} is not proof`);
        equal(h.controller.getView().pendingImportId, kind, "barrier retained");
      }
    },
  },
  {
    name: "T03 readonly escape keeps failed memory or opens actual device snapshot with allowance",
    async run() {
      const h = harness();
      h.faults.write = async () => {
        throw new Error("write failed");
      };
      const result = await h.controller.commit(h.input());
      const originalMemory = h.context.state;
      const flushes = h.stats.flushes;
      h.raw.delete("personal");
      const failed = await h.controller.openDeviceSnapshot(result.id);
      equal(
        failed.status,
        "applied-unconfirmed",
        "missing device is not escape",
      );
      equal(h.context.state, originalMemory, "failed escape preserves memory");
      const allowance = fingerprintFinanceState(h.s0);
      h.raw.set("personal", encodeBackup(h.s0));
      h.faults.inspect = (inspection) =>
        inspection.status === "readable"
          ? {
              ...inspection,
              recovery: {
                anchorText: encodeBackup(h.s0),
                normalizationDate: date,
                normalizationVersion: 1,
                allowance,
              },
            }
          : inspection;
      const writes = h.writes.length;
      const escaped = await h.controller.openDeviceSnapshot(result.id);
      equal(
        escaped.status,
        "device-snapshot-opened",
        "actual device snapshot opened",
      );
      check(escaped.status === "device-snapshot-opened", "narrow result");
      equal(
        escaped.summary.after.counts.transactions,
        1,
        "original S1 summary retained",
      );
      equal(
        escaped.openedSnapshot.summary.counts.transactions,
        0,
        "opened S0 distinguished",
      );
      snapshotEqual(h.context.state, h.s0, "memory now actual device state");
      equal(h.activations[0].allowance, allowance, "recovery budget retained");
      equal(
        h.activations[0].reason,
        "device-snapshot",
        "activation cannot write preferences",
      );
      equal(h.writes.length, writes, "escape is readonly");
      equal(h.stats.flushes, flushes, "escape never flushes financial writes");
      equal(
        h.raw.get("personal"),
        encodeBackup(h.s0),
        "device bytes unchanged",
      );
      equal(
        h.controller.getView().pendingImportId,
        null,
        "explicit escape releases barrier",
      );
    },
  },
  {
    name: "T03 recovery failure retains old memory; same intent retry writes and activates only after proof",
    async run() {
      const h = harness(false);
      h.faults.write = async () => {
        throw new Error("recover failed");
      };
      const pending = await h.recover();
      equal(
        pending.status,
        "recovery-unconfirmed",
        "recovery differs from applied import",
      );
      equal(pending.appliedAt, null, "no claimed application time");
      equal(pending.appliedRevision, null, "no claimed applied revision");
      equal(h.context.state, h.s0, "candidate not applied before proof");
      equal(h.context.ready, false, "loading recovery stays unavailable");
      equal(h.stats.installs, 0, "no optimistic install");
      h.faults.write = undefined;
      const result = await h.controller.retry(pending.id);
      equal(result.status, "confirmed", "same recovery intent confirmed");
      snapshotEqual(h.context.state, h.s1, "proof activates S1");
      equal(h.context.ready, true, "ready only after proof");
      equal(h.stats.applies, 1, "candidate prepared once");
      equal(
        h.stats.preparations,
        1,
        "old-profile flush not repeated after write failure",
      );
      equal(h.writes.length, 2, "failed recovery plus explicit retry");
      equal(
        h.writes[1].strategy,
        "recover",
        "retry preserves recovery strategy",
      );
      equal(
        h.activations[0].reason,
        "recovery-confirmed",
        "normal recovery activation",
      );
    },
  },
  {
    name: "T03 ambiguous recovery uses readonly exact proof even when escape is selected",
    async run() {
      for (const action of ["retry", "escape"] as const) {
        const h = harness(false);
        h.faults.write = async (_entry, persist) => {
          await persist();
          throw new Error("recover committed but rejected");
        };
        const pending = await h.recover("recover-other", other);
        equal(h.context.state, h.s0, "old memory before recovery proof");
        const result = await (action === "retry"
          ? h.controller.retry(pending.id)
          : h.controller.openDeviceSnapshot(pending.id));
        equal(result.status, "confirmed", "exact recovery candidate confirmed");
        equal(h.writes.length, 1, "no second recovery write");
        if (action === "retry") {
          equal(
            h.context.profileId,
            "personal",
            "retry keeps the active profile",
          );
          equal(
            h.context.state,
            h.s0,
            "retry keeps the current memory snapshot",
          );
          equal(
            h.activations.length,
            0,
            "foreign confirmation never activates",
          );
          equal(
            result.appliedRevision,
            null,
            "foreign restore has no memory revision",
          );
        } else {
          equal(
            h.context.profileId,
            other,
            "explicit escape opens verified target",
          );
          equal(
            h.activations[0].reason,
            "device-snapshot",
            "escape uses read-only activation",
          );
        }
      }
    },
  },
  {
    name: "T03 cross-profile retry preserves the current profile before confirming an already matching destination",
    async run() {
      const h = harness();
      h.context.state = h.s2;
      h.context.revision++;
      h.raw.set(other, encodeBackup(h.s1));
      h.faults.write = async () => {
        throw new Error("current profile save failed");
      };
      const pending = await h.recover("recover-matching-other", other);
      equal(pending.status, "recovery-unconfirmed", "preparation failed");
      equal(h.stats.preparations, 1, "first preservation attempted");
      equal(h.context.profileId, "personal", "current profile stays open");
      equal(h.context.state, h.s2, "unsaved current snapshot stays in memory");

      const failed = await h.controller.retry(pending.id);
      equal(
        failed.status,
        "recovery-unconfirmed",
        "matching B cannot hide failed A save",
      );
      equal(h.stats.preparations, 2, "retry repeats failed preservation");
      equal(h.activations.length, 0, "no activation before A is saved");
      equal(h.context.state, h.s2, "second failure preserves unsaved A");

      h.faults.write = undefined;
      const confirmed = await h.controller.retry(pending.id);
      equal(confirmed.status, "confirmed", "retry confirms after preserving A");
      equal(h.stats.preparations, 3, "successful retry finishes preservation");
      equal(h.writes.length, 3, "two failed A saves and one successful A save");
      check(
        h.writes.every(
          (entry) => entry.profile === "personal" && entry.strategy === "save",
        ),
        "the already matching destination is never written again",
      );
      equal(
        h.raw.get("personal"),
        encodeBackup(h.s2),
        "full A snapshot preserved",
      );
      equal(h.raw.get(other), encodeBackup(h.s1), "B bytes unchanged");
      equal(
        h.context.profileId,
        "personal",
        "A stays active after B is confirmed",
      );
      equal(h.context.state, h.s2, "A memory snapshot remains installed");
      equal(h.activations.length, 0, "normal foreign retry never activates B");
      equal(
        confirmed.appliedRevision,
        null,
        "no memory revision for inactive B",
      );
      equal(h.stats.applies, 1, "retry never reapplies the recovery candidate");
    },
  },
  {
    name: "T03 successful inactive-profile recovery confirms B without changing active A or invoking activation",
    async run() {
      const h = harness();
      const before = { ...h.context };
      h.faults.activate = () => {
        throw new Error(
          "inactive recovery must not invoke the activation port",
        );
      };
      const result = await h.recover("recover-inactive", other);
      equal(result.status, "confirmed", "B write and exact readback confirmed");
      equal(result.profileId, other, "receipt belongs to inactive B");
      equal(
        result.appliedRevision,
        null,
        "B was not installed in active memory",
      );
      check(result.appliedAt, "confirmed write has an application time");
      equal(
        h.context.profileId,
        before.profileId,
        "A remains the active profile",
      );
      equal(h.context.state, before.state, "A memory reference is preserved");
      equal(h.context.revision, before.revision, "A revision does not change");
      equal(h.context.ready, before.ready, "A remains ready");
      equal(
        h.activations.length,
        0,
        "no activation or preference-writing port",
      );
      equal(
        h.raw.get("personal"),
        encodeBackup(h.s0),
        "A device bytes unchanged",
      );
      equal(h.raw.get(other), encodeBackup(h.s1), "B full snapshot restored");
      equal(h.writes.length, 1, "only B requires a financial write");
      equal(h.writes[0].profile, other, "write targets B");
      equal(h.writes[0].strategy, "recover", "B uses explicit recovery");
      equal(
        h.controller.getView().pendingImportId,
        null,
        "confirmation releases the barrier",
      );
    },
  },
  {
    name: "T03 explicit device-snapshot escape after failed cross-profile preparation never saves the current profile",
    async run() {
      const h = harness();
      h.context.state = h.s2;
      h.context.revision++;
      h.raw.set(other, encodeBackup(h.s1));
      h.faults.write = async () => {
        throw new Error("current profile save failed");
      };
      const pending = await h.recover("escape-matching-other", other);
      const writes = h.writes.length,
        preparations = h.stats.preparations,
        flushes = h.stats.flushes;
      h.faults.write = undefined;
      const escaped = await h.controller.openDeviceSnapshot(pending.id);
      equal(escaped.status, "confirmed", "exact device snapshot may be opened");
      equal(h.writes.length, writes, "explicit discard does not save A or B");
      equal(
        h.stats.preparations,
        preparations,
        "escape never prepares recovery",
      );
      equal(h.stats.flushes, flushes, "escape never flushes queued writes");
      equal(h.raw.get("personal"), encodeBackup(h.s0), "device A unchanged");
      equal(h.raw.get(other), encodeBackup(h.s1), "device B unchanged");
      equal(h.context.profileId, other, "requested device profile opened");
      equal(h.activations[0].reason, "device-snapshot", "read-only activation");
    },
  },
  {
    name: "T03 changed context refuses pending retry and fixed validation date survives midnight",
    async run() {
      const h = harness();
      h.faults.write = async () => {
        throw new Error("failed");
      };
      const pending = await h.controller.commit(h.input());
      const state = h.context.state,
        revision = h.context.revision;
      h.context.profileId = other;
      await rejects(h.controller.retry(pending.id), "changed profile rejected");
      equal(h.reads.length, 0, "no reads after changed context");
      h.context.profileId = "personal";
      h.context.state = h.s2;
      h.context.revision++;
      await rejects(
        h.controller.retry(pending.id),
        "newer revision cannot be overwritten",
      );
      equal(h.writes.length, 1, "no writes after changed context");
      h.context.state = state;
      h.context.revision = revision;
      h.context.validationDate = "2025-03-01";
      h.faults.write = undefined;
      const result = await h.controller.retry(pending.id);
      equal(result.status, "confirmed", "retry with original date");
      check(
        h.reads.every((read) => read.date === date),
        "all inspection dates fixed at application",
      );
      equal(result.summary.after.asOf, date, "summary date fixed");
    },
  },
  {
    name: "T03 journal-confirmed new profile is recorded without another application or save",
    async run() {
      const h = harness();
      const input = {
        id: "recovery:durable-journal",
        profileId: other,
        profileName: "Синтетический новый",
        format: null,
        validationDate: date,
        fingerprint: fingerprintFinanceState(h.s1),
        summary: buildReplacementImportSummary(null, h.s1, date, "new-profile"),
        appliedRevision: 7,
      };
      const result = h.controller.recordVerifiedRestore(input);
      equal(result.status, "confirmed", "existing durable proof recorded");
      equal(result.format, null, "resumed transport remains unknown");
      equal(result.summary.beforeStatus, "new-profile", "new profile summary");
      equal(
        h.controller.recordVerifiedRestore({
          ...input,
          summary: buildReplacementImportSummary(null, h.s2, date),
        }),
        result,
        "same journal result is once-only",
      );
      equal(
        await h.controller.retry(result.id),
        result,
        "old journal result cannot write",
      );
      equal(h.stats.applies, 0, "does not enter import apply");
      equal(h.writes.length, 0, "does not repeat T02 write");
      equal(h.reads.length, 0, "uses caller's verified journal inspection");
    },
  },
];
