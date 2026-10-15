import type { FinanceState } from "../../domain/types";
import { validateBackupValue } from "../../domain/backup";
import type { FinanceProfile } from "../../domain/profiles";
import {
  fingerprintFinanceState,
  sameFingerprint,
  type ContentFingerprint,
} from "../../domain/backupRecovery";
import {
  buildFinanceSnapshotSummary,
  type BackupTransportFormat,
  type FinanceSnapshotSummary,
  type ImportApplication,
  type ImportSummary,
} from "../../domain/dataTransfer";
import type {
  LedgerInspection,
  LedgerRecoveryAnchor,
} from "../../infrastructure/storage/ledgerContracts";

export type ImportFormat = "csv" | BackupTransportFormat | null;
export type ImportMode = "add" | "replace" | "new-profile";
type ResultBase = {
  readonly id: string;
  readonly profileId: FinanceProfile;
  readonly profileName: string;
  readonly format: ImportFormat;
  readonly mode: ImportMode;
  readonly requestedAt: string;
  readonly validationDate: string;
  readonly snapshotFingerprint: ContentFingerprint;
  readonly summary: ImportSummary;
  readonly error?: string;
};
export type ImportResult = ResultBase &
  (
    | {
        readonly status: "applied-unconfirmed";
        readonly appliedAt: string;
        readonly appliedRevision: number;
      }
    | {
        readonly status: "recovery-unconfirmed";
        readonly appliedAt: null;
        readonly appliedRevision: null;
      }
    | {
        readonly status: "confirmed";
        readonly appliedAt: string;
        /** Null when an inactive profile was restored without replacing memory. */
        readonly appliedRevision: number | null;
        readonly confirmedAt: string;
      }
    | {
        readonly status: "device-snapshot-opened";
        readonly appliedAt: string | null;
        readonly appliedRevision: number | null;
        readonly openedAt: string;
        readonly openedSnapshot: {
          readonly snapshotDate: string;
          readonly fingerprint: ContentFingerprint;
          readonly summary: FinanceSnapshotSummary;
        };
      }
  );

export interface ImportContext {
  profileId: FinanceProfile;
  profileName: string;
  state: FinanceState;
  revision: number;
  validationDate: string;
  ready: boolean;
}
export interface CommitImportInput {
  operationId: string;
  expectedProfileId: FinanceProfile;
  format: "csv" | BackupTransportFormat;
  mode: "add" | "replace";
  apply(current: FinanceState, today: string): ImportApplication;
}
export interface RestoreResultMetadata {
  operationId: string;
  format: BackupTransportFormat;
  sourceDemo?: boolean;
}
export interface RecoveryImportInput {
  operationId: string;
  profileId: FinanceProfile;
  profileName: string;
  format: BackupTransportFormat;
  prepare(context: ImportContext): ImportApplication;
}
export type ReadableInspection = Extract<
  LedgerInspection,
  { status: "readable" }
>;
export interface ImportControllerView {
  readonly importResults: readonly ImportResult[];
  readonly latestImportResultId: string | null;
  readonly pendingImportId: string | null;
  readonly busyImportId: string | null;
}
export interface ImportControllerPorts {
  context(): ImportContext;
  acquireOperation(): () => void;
  validateNext(state: FinanceState): number;
  installApplied(state: FinanceState, bytes: number): number;
  flush(): Promise<void>;
  prepareRecovery(context: ImportContext): Promise<void>;
  save(
    profile: FinanceProfile,
    state: FinanceState,
    strategy: "save" | "recover",
  ): Promise<boolean>;
  inspect(profile: FinanceProfile, date: string): Promise<LedgerInspection>;
  invalidateAcknowledgement(profile: FinanceProfile): void;
  acknowledge(profile: FinanceProfile, state: FinanceState): void;
  activate(
    profile: FinanceProfile,
    state: FinanceState,
    allowance: LedgerRecoveryAnchor["allowance"] | undefined,
    reason: "recovery-confirmed" | "device-snapshot",
  ): number | Promise<number>;
  nowIso(): string;
  prepareReplacement?(input: {
    profileId: FinanceProfile;
    operationId: string;
    next: FinanceState;
    validationDate: string;
  }): Promise<void>;
  settleReplacement?(
    profileId: FinanceProfile,
    snapshot: FinanceState,
  ): Promise<void>;
}
interface PendingImport {
  result: ImportResult;
  state: FinanceState;
  context: ImportContext;
  strategy: "save" | "recover";
  recoveryPrepared: boolean;
}
interface Intent {
  profileId: FinanceProfile;
  format: ImportFormat;
  mode: ImportMode;
  promise: Promise<ImportResult>;
}
export const pendingImportMessage =
  "Сначала завершите сохранение импорта: откройте его результат, повторите сохранение или прочитайте снимок устройства.";
const changedContext = () =>
  new Error("Профиль изменился. Откройте форму импорта заново.");
const unconfirmed = () =>
  new Error(
    "Запись точного снимка не подтверждена. Повторите проверку и сохранение или откройте читаемый снимок устройства.",
  );

/** Session-only state machine. All financial IO and React state live in ports. */
export function createImportController(ports: ImportControllerPorts) {
  const listeners = new Set<() => void>();
  const results = new Map<string, ImportResult>();
  const intents = new Map<string, Intent>();
  let pending: PendingImport | undefined;
  let busyId: string | null = null;
  let activeAttempt: Promise<ImportResult> | undefined;
  let view: ImportControllerView = {
    importResults: [],
    latestImportResultId: null,
    pendingImportId: null,
    busyImportId: null,
  };
  function publish() {
    const importResults = [...results.values()];
    view = {
      importResults,
      latestImportResultId: importResults.at(-1)?.id ?? null,
      pendingImportId: pending?.result.id ?? null,
      busyImportId: busyId,
    };
    for (const listener of listeners) listener();
  }
  function remember(result: ImportResult) {
    results.set(result.id, result);
    if (pending?.result.id === result.id) pending.result = result;
    publish();
    return result;
  }
  function assertContext(value: PendingImport) {
    const current = ports.context();
    const revision = value.result.appliedRevision ?? value.context.revision;
    const state =
      value.result.appliedRevision === null ? value.context.state : value.state;
    if (
      current.profileId !== value.context.profileId ||
      current.revision !== revision ||
      current.state !== state
    )
      throw changedContext();
  }
  function isExact(value: PendingImport, inspection: LedgerInspection) {
    return (
      inspection.status === "readable" &&
      inspection.state.demo === (value.result.profileId === "demo") &&
      sameFingerprint(
        fingerprintFinanceState(inspection.state),
        value.result.snapshotFingerprint,
      )
    );
  }
  async function confirm(
    value: PendingImport,
    inspection: ReadableInspection,
    reason: "recovery-confirmed" | "device-snapshot" = "recovery-confirmed",
  ) {
    assertContext(value);
    if (value.result.mode === "replace") {
      await prepareReplacement(value);
      await ports.settleReplacement?.(value.result.profileId, inspection.state);
      assertContext(value);
    }
    let appliedRevision = value.result.appliedRevision;
    // Restoring an inactive profile confirms its record without switching away
    // from the current profile. Only an explicit device-snapshot open may do so.
    if (
      appliedRevision === null &&
      (reason === "device-snapshot" ||
        value.result.profileId === value.context.profileId)
    )
      appliedRevision = await ports.activate(
        value.result.profileId,
        value.state,
        inspection.recovery?.allowance,
        reason,
      );
    ports.acknowledge(value.result.profileId, value.state);
    const result: ImportResult = {
      ...value.result,
      status: "confirmed",
      appliedAt: value.result.appliedAt ?? ports.nowIso(),
      appliedRevision,
      confirmedAt: ports.nowIso(),
      error: undefined,
    };
    pending = undefined;
    return remember(result);
  }
  async function inspect(value: PendingImport) {
    const inspection = await ports.inspect(
      value.result.profileId,
      value.result.validationDate,
    );
    assertContext(value);
    return inspection;
  }
  async function ensureRecoveryPrepared(value: PendingImport) {
    if (!value.recoveryPrepared) {
      await ports.prepareRecovery(value.context);
      assertContext(value);
      value.recoveryPrepared = true;
    }
  }
  async function prepareReplacement(value: PendingImport) {
    if (value.result.mode !== "replace") return;
    await ports.prepareReplacement?.({
      profileId: value.result.profileId,
      operationId: value.result.id,
      next: value.state,
      validationDate: value.result.validationDate,
    });
    assertContext(value);
  }
  async function writeAndConfirm(value: PendingImport) {
    assertContext(value);
    await prepareReplacement(value);
    if (value.strategy === "recover") await ensureRecoveryPrepared(value);
    const acknowledged = await ports.save(
      value.result.profileId,
      value.state,
      value.strategy,
    );
    assertContext(value);
    if (!acknowledged) throw unconfirmed();
    const inspection = await inspect(value);
    if (inspection.status !== "readable" || !isExact(value, inspection))
      throw unconfirmed();
    return confirm(value, inspection);
  }
  function fail(value: PendingImport, error: unknown) {
    return remember({
      ...value.result,
      error: error instanceof Error ? error.message : unconfirmed().message,
    });
  }
  function once(
    id: string,
    identity: Omit<Intent, "promise">,
    task: () => Promise<ImportResult>,
  ): Promise<ImportResult> {
    const known = intents.get(id);
    if (known) {
      if (
        known.profileId !== identity.profileId ||
        known.format !== identity.format ||
        known.mode !== identity.mode
      )
        return Promise.reject(new Error("Идентификатор импорта уже занят."));
      const result = results.get(id);
      return busyId === id
        ? (activeAttempt ?? known.promise)
        : result
          ? Promise.resolve(result)
          : known.promise;
    }
    if (!id.trim())
      return Promise.reject(new Error("Нет идентификатора импорта."));
    if (pending) return Promise.reject(new Error(pendingImportMessage));
    // Register before executing even the synchronous portion of apply.
    let resolve!: (result: ImportResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<ImportResult>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    intents.set(id, { ...identity, promise });
    task().then(resolve, (error) => {
      // A rejected validation/acquisition did not apply anything. Allow the
      // same form to retry after fixing it; applied intents always retain ID.
      if (!results.has(id)) intents.delete(id);
      reject(error);
    });
    return promise;
  }
  async function firstAttempt(id: string, prepare: () => PendingImport) {
    const release = ports.acquireOperation();
    busyId = id;
    try {
      const value = prepare();
      pending = value;
      remember(value.result);
      try {
        return await writeAndConfirm(value);
      } catch (error) {
        return fail(value, error);
      }
    } finally {
      busyId = null;
      release();
      publish();
    }
  }
  function commit(input: CommitImportInput) {
    return once(
      input.operationId,
      {
        profileId: input.expectedProfileId,
        format: input.format,
        mode: input.mode,
      },
      () =>
        firstAttempt(input.operationId, () => {
          const context = ports.context();
          if (!context.ready || context.profileId !== input.expectedProfileId)
            throw changedContext();
          const application = input.apply(
            context.state,
            context.validationDate,
          );
          // Readonly inspection returns schema-normalized objects. Install that
          // same S1 before measuring the receipt, including its property order.
          const next = validateBackupValue(
            application.state,
            context.validationDate,
          );
          const bytes = ports.validateNext(next);
          const snapshotFingerprint = fingerprintFinanceState(next);
          const requestedAt = ports.nowIso();
          const appliedRevision = ports.installApplied(next, bytes);
          return {
            context,
            state: next,
            strategy: "save",
            recoveryPrepared: false,
            result: {
              id: input.operationId,
              profileId: context.profileId,
              profileName: context.profileName,
              format: input.format,
              mode: input.mode,
              requestedAt,
              validationDate: context.validationDate,
              snapshotFingerprint,
              summary: application.summary,
              status: "applied-unconfirmed",
              appliedAt: requestedAt,
              appliedRevision,
            },
          };
        }),
    );
  }
  function recover(input: RecoveryImportInput) {
    return once(
      input.operationId,
      { profileId: input.profileId, format: input.format, mode: "replace" },
      () =>
        firstAttempt(input.operationId, () => {
          const context = ports.context();
          const application = input.prepare(context);
          const next = validateBackupValue(
            application.state,
            context.validationDate,
          );
          if (next.demo !== (input.profileId === "demo"))
            throw new Error("Копия относится к другому профилю.");
          return {
            context,
            state: next,
            strategy: "recover",
            recoveryPrepared: false,
            result: {
              id: input.operationId,
              profileId: input.profileId,
              profileName: input.profileName,
              format: input.format,
              mode: "replace",
              requestedAt: ports.nowIso(),
              validationDate: context.validationDate,
              snapshotFingerprint: fingerprintFinanceState(next),
              summary: application.summary,
              status: "recovery-unconfirmed",
              appliedAt: null,
              appliedRevision: null,
            },
          };
        }),
    );
  }
  function continuePending(
    id: string,
    task: (value: PendingImport) => Promise<ImportResult>,
  ): Promise<ImportResult> {
    const result = results.get(id);
    if (!result)
      return Promise.reject(new Error("Результат импорта не найден."));
    if (
      result.status === "confirmed" ||
      result.status === "device-snapshot-opened"
    )
      return Promise.resolve(result);
    if (pending?.result.id !== id)
      return Promise.reject(new Error("Это намерение импорта уже неактивно."));
    if (busyId === id) return activeAttempt ?? intents.get(id)!.promise;
    const value = pending;
    let release: (() => void) | undefined;
    try {
      release = ports.acquireOperation();
      assertContext(value);
    } catch (error) {
      // acquireOperation may fail before acquiring anything.
      release?.();
      return Promise.reject(error);
    }
    busyId = id;
    remember({ ...value.result, error: undefined });
    activeAttempt = Promise.resolve()
      .then(() => task(value))
      .catch((error) => fail(value, error))
      .finally(() => {
        activeAttempt = undefined;
        busyId = null;
        release?.();
        publish();
      });
    return activeAttempt;
  }
  function retry(id: string) {
    return continuePending(id, async (value) => {
      await ports.flush();
      // A matching destination does not prove that the current profile survived
      // an earlier failed preparation. Finish preserving it before confirmation.
      if (
        value.strategy === "recover" &&
        value.context.ready &&
        value.result.profileId !== value.context.profileId
      )
        await ensureRecoveryPrepared(value);
      const inspection = await inspect(value);
      if (inspection.status === "readable" && isExact(value, inspection))
        return confirm(value, inspection);
      ports.invalidateAcknowledgement(value.result.profileId);
      return writeAndConfirm(value);
    });
  }
  function openDeviceSnapshot(id: string) {
    return continuePending(id, async (value) => {
      // The completed attempt already drained its writes; pending blocks new
      // ones. This explicit discard path only reads, even after preparation failed.
      const inspection = await inspect(value);
      if (
        inspection.status !== "readable" ||
        inspection.state.demo !== (value.result.profileId === "demo")
      )
        throw new Error(
          "Нет читаемого снимка этого профиля. Память не заменена; повторите проверку или сохранение.",
        );
      if (isExact(value, inspection))
        return confirm(value, inspection, "device-snapshot");
      const openedSnapshot = {
        snapshotDate: inspection.snapshotDate,
        fingerprint: fingerprintFinanceState(inspection.state),
        summary: buildFinanceSnapshotSummary(
          inspection.state,
          inspection.snapshotDate,
        ),
      };
      assertContext(value);
      if (value.result.mode === "replace") {
        await ports.settleReplacement?.(
          value.result.profileId,
          inspection.state,
        );
        assertContext(value);
      }
      await ports.activate(
        value.result.profileId,
        inspection.state,
        inspection.recovery?.allowance,
        "device-snapshot",
      );
      ports.acknowledge(value.result.profileId, inspection.state);
      const opened: ImportResult = {
        ...value.result,
        status: "device-snapshot-opened",
        openedAt: ports.nowIso(),
        openedSnapshot,
        error: undefined,
      };
      pending = undefined;
      return remember(opened);
    });
  }
  function recordVerifiedRestore(input: {
    id: string;
    profileId: FinanceProfile;
    profileName: string;
    format: BackupTransportFormat | null;
    validationDate: string;
    fingerprint: ContentFingerprint;
    summary: ImportSummary;
    appliedRevision: number;
  }): ImportResult {
    const previous = results.get(input.id);
    if (previous) return previous;
    const now = ports.nowIso();
    const result: ImportResult = {
      id: input.id,
      profileId: input.profileId,
      profileName: input.profileName,
      format: input.format,
      mode: "new-profile",
      validationDate: input.validationDate,
      snapshotFingerprint: input.fingerprint,
      summary: input.summary,
      requestedAt: now,
      appliedAt: now,
      appliedRevision: input.appliedRevision,
      confirmedAt: now,
      status: "confirmed",
    };
    intents.set(input.id, {
      profileId: input.profileId,
      format: input.format,
      mode: "new-profile",
      promise: Promise.resolve(result),
    });
    return remember(result);
  }
  return {
    commit,
    recover,
    retry,
    openDeviceSnapshot,
    recordVerifiedRestore,
    hasPending: () => pending !== undefined,
    getView: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type ImportController = ReturnType<typeof createImportController>;
