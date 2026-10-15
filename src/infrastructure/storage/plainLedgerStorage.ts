import {
  backupByteLength,
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
} from "../../domain/backup";
import {
  assertVerifiedRestoreCandidate,
  fingerprintText,
  type VerifiedRestoreCandidate,
} from "../../domain/backupRecovery";
import { localDate } from "../../domain/finance";
import type { FinanceState } from "../../domain/types";
import type { LedgerInspection, LedgerInspectOptions } from "./ledgerContracts";
import type { FinanceProfile } from "./profileStorage";
import {
  confirmImportedSnapshot,
  readRecoveryRecord,
  recoveryInspection,
  RECOVERY_RECORD_PREFIX,
  updateRecoveryRecord,
  writeRecoveryRecord,
} from "./recoveryLedger";
import { LEGACY_STORAGE_KEY } from "./vault";

export function createPlainLedgerStorage(
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<unknown>;
  },
  profileId: FinanceProfile = "personal",
) {
  let previousBytes: number | undefined;
  const inspect = async (
    options: LedgerInspectOptions = {},
  ): Promise<LedgerInspection> => {
    let raw: string | null;
    try {
      raw = await storage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return { status: "unavailable", reason: "storage" };
    }
    if (raw === null) return { status: "missing" };
    if (raw.startsWith(RECOVERY_RECORD_PREFIX)) {
      try {
        return recoveryInspection(
          readRecoveryRecord(raw),
          raw,
          "rescue-plain-v1",
          profileId,
        );
      } catch {
        return { status: "damaged", reason: "rescue-allowance" };
      }
    }
    const date = options.normalizationDate ?? localDate();
    try {
      return {
        status: "readable",
        state: decodeBackup(raw, date),
        sourceText: raw,
        snapshotIdentity: {
          format: "plaintext",
          recordFingerprint: fingerprintText(raw),
          sourceFingerprint: fingerprintText(raw),
        },
        normalizationDate: date,
        normalizationVersion: 1,
        snapshotDate: date,
      };
    } catch {
      return { status: "damaged", reason: "financial-json" };
    }
  };
  const load = async () => {
    const raw = await storage.getItem(LEGACY_STORAGE_KEY);
    const state =
      raw === null
        ? null
        : raw.startsWith(RECOVERY_RECORD_PREFIX)
          ? readRecoveryRecord(raw).candidate.state
          : decodeBackup(raw);
    previousBytes = state ? backupByteLength(encodeBackup(state)) : 0;
    return state;
  };
  const save = async (state: FinanceState) => {
    // Re-read the durable recovery anchor; a process-local allowance is never authority.
    const raw = await storage.getItem(LEGACY_STORAGE_KEY);
    if (raw?.startsWith(RECOVERY_RECORD_PREFIX)) {
      const current = readRecoveryRecord(raw);
      const next = updateRecoveryRecord(current, state, localDate());
      if (next.unchanged) {
        previousBytes =
          current.candidate.identity.normalizedFingerprint.utf8Bytes;
        return;
      }
      await storage.setItem(LEGACY_STORAGE_KEY, next.raw);
      if ((await storage.getItem(LEGACY_STORAGE_KEY)) !== next.raw)
        throw new Error("Не удалось проверить запись восстановленного учёта.");
      previousBytes = backupByteLength(encodeBackup(state));
      return;
    }
    if (previousBytes === undefined) await load();
    const content = checkedBackupContent(state, previousBytes);
    await storage.setItem(LEGACY_STORAGE_KEY, content);
    previousBytes = backupByteLength(content);
  };
  return {
    inspect,
    load,
    save,
    async writeImportedSnapshot(
      candidate: VerifiedRestoreCandidate,
      { operationId }: { operationId: string },
    ) {
      assertVerifiedRestoreCandidate(candidate);
      const previous = await inspect({
        normalizationDate: candidate.identity.snapshotDate,
      });
      if (previous.status !== "missing")
        return confirmImportedSnapshot(previous, candidate, operationId);
      const raw = writeRecoveryRecord(candidate, operationId);
      await storage.setItem(LEGACY_STORAGE_KEY, raw);
      if ((await storage.getItem(LEGACY_STORAGE_KEY)) !== raw)
        throw new Error("Не удалось проверить запись восстановленного учёта.");
      const receipt = confirmImportedSnapshot(
        await inspect(),
        candidate,
        operationId,
      );
      previousBytes = candidate.identity.normalizedFingerprint.utf8Bytes;
      return receipt;
    },
    async recover(state: FinanceState) {
      let allowance = 0;
      try {
        const previous = await load();
        if (previous) allowance = previousBytes ?? 0;
      } catch {
        /* An explicit recovery may replace damaged data within 5 MB. */
      }
      const content = checkedBackupContent(state, allowance);
      await storage.setItem(LEGACY_STORAGE_KEY, content);
      previousBytes = backupByteLength(content);
    },
  };
}
