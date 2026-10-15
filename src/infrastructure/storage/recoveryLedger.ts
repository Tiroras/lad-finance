import { MAX_BACKUP_BYTES, validateBackupValue } from "../../domain/backup";
import {
  assertVerifiedRestoreCandidate,
  fingerprintFinanceState,
  fingerprintText,
  parseRestoreCandidateIdentity,
  prepareRestoreCandidate,
  restoreCandidateText,
  sameFingerprint,
  sameRestoreIdentity,
  MAX_RESCUE_SOURCE_UTF16,
  type RestoreCandidateIdentity,
  type VerifiedRestoreCandidate,
} from "../../domain/backupRecovery";
import { validDate } from "../../domain/finance";
import { writeMeasuredJson } from "../../domain/backupMeasurement";
import type { FinanceState } from "../../domain/types";
import type {
  LedgerInspection,
  LedgerSnapshotIdentity,
} from "./ledgerContracts";
import type { FinanceProfile } from "./profileStorage";

export const RECOVERY_RECORD_PREFIX = "lad-local-recovery/1\n";
export const MAX_RECOVERY_HEADER = 4096;
export interface RecoveryMetadata {
  operationId: string;
  initialIdentity: RestoreCandidateIdentity;
  sourceUnits: number;
  snapshotDate: string;
}
export interface RecoveryRecord {
  metadata: RecoveryMetadata;
  candidate: VerifiedRestoreCandidate;
  currentText: string;
}
export const validOperationId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
export function parseRecoveryMetadata(value: unknown): RecoveryMetadata {
  const v = value as Partial<RecoveryMetadata> | null;
  if (
    !v ||
    typeof v !== "object" ||
    !validOperationId(v.operationId) ||
    !Number.isSafeInteger(v.sourceUnits) ||
    v.sourceUnits! < 1 ||
    v.sourceUnits! > MAX_RESCUE_SOURCE_UTF16 ||
    typeof v.snapshotDate !== "string" ||
    !validDate(v.snapshotDate) ||
    Object.keys(v).sort().join() !==
      "initialIdentity,operationId,snapshotDate,sourceUnits"
  )
    throw new Error("Повреждены условия локального восстановления.");
  return {
    operationId: v.operationId,
    sourceUnits: v.sourceUnits!,
    snapshotDate: v.snapshotDate,
    initialIdentity: parseRestoreCandidateIdentity(v.initialIdentity),
  };
}
export function readRecoveryRecord(raw: string): RecoveryRecord {
  if (!raw.startsWith(RECOVERY_RECORD_PREFIX))
    throw new Error("Неизвестный формат восстановления.");
  const start = RECOVERY_RECORD_PREFIX.length;
  const end = raw.indexOf("\n", start);
  if (end < start || end - start > MAX_RECOVERY_HEADER)
    throw new Error("Повреждён заголовок восстановления.");
  const metadata = parseRecoveryMetadata(JSON.parse(raw.slice(start, end)));
  const sourceEnd = end + 1 + metadata.sourceUnits;
  const source = raw.slice(end + 1, sourceEnd);
  const identity = metadata.initialIdentity;
  const anchor = prepareRestoreCandidate(source, {
    normalizationDate: identity.normalizationDate,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: identity.mode,
  });
  if (
    !sameFingerprint(
      anchor.identity.sourceFingerprint,
      identity.sourceFingerprint,
    ) ||
    !sameFingerprint(anchor.identity.allowance, identity.allowance)
  )
    throw new Error(
      "Исходник восстановления не соответствует разрешённому размеру.",
    );
  // Bound the remaining section before financial JSON parsing.
  if (raw.length - sourceEnd > anchor.identity.allowance.utf16Units)
    throw new Error("Снимок превышает проверенный размер исходника.");
  const currentText = raw.slice(sourceEnd);
  const candidate = prepareRestoreCandidate(anchor, {
    normalizationDate: identity.normalizationDate,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: identity.mode,
    currentSnapshotText: currentText,
    snapshotDate: metadata.snapshotDate,
  });
  return { metadata, candidate, currentText };
}
export function writeRecoveryRecord(
  candidate: VerifiedRestoreCandidate,
  operationId: string,
): string {
  assertVerifiedRestoreCandidate(candidate);
  if (!validOperationId(operationId))
    throw new Error("Некорректный идентификатор восстановления.");
  return frameRecovery(
    {
      operationId,
      initialIdentity: candidate.identity,
      sourceUnits: candidate.sourceText.length,
      snapshotDate: candidate.identity.snapshotDate,
    },
    candidate.sourceText,
    restoreCandidateText(candidate),
  );
}
function frameRecovery(
  metadata: RecoveryMetadata,
  source: string,
  current: string,
) {
  const header = JSON.stringify(metadata);
  if (header.length > MAX_RECOVERY_HEADER)
    throw new Error("Заголовок восстановления слишком большой.");
  return RECOVERY_RECORD_PREFIX + header + "\n" + source + current;
}
export function sameFinancialSnapshot(
  a: FinanceState,
  b: FinanceState,
): boolean {
  const equal = (x: unknown, y: unknown): boolean => {
    if (x === y) return true;
    if (!x || !y || typeof x !== "object" || typeof y !== "object")
      return false;
    if (Array.isArray(x) || Array.isArray(y))
      return (
        Array.isArray(x) &&
        Array.isArray(y) &&
        x.length === y.length &&
        x.every((v, i) => equal(v, y[i]))
      );
    const first = x as Record<string, unknown>,
      second = y as Record<string, unknown>;
    const keys = Object.keys(first).filter((k) => first[k] !== undefined);
    return (
      keys.length ===
        Object.keys(second).filter((k) => second[k] !== undefined).length &&
      keys.every((k) => Object.hasOwn(second, k) && equal(first[k], second[k]))
    );
  };
  return equal(a, b);
}
export function updateRecoveryRecord(
  record: RecoveryRecord,
  state: FinanceState,
  snapshotDate: string,
): { unchanged: true } | { raw: string; ordinary: boolean; unchanged?: false } {
  // Validate without the ordinary reader's input cap, then measure before allocating JSON.
  const normalized = validateBackupValue(state, snapshotDate);
  if (normalized.demo !== false)
    throw new Error("Восстановленный профиль должен оставаться личным.");
  const next = fingerprintFinanceState(normalized);
  const previous = fingerprintText(record.currentText);
  const allowance = record.candidate.identity.allowance;
  const ordinary =
    next.utf16Units <= MAX_BACKUP_BYTES && next.utf8Bytes <= MAX_BACKUP_BYTES;
  // A write may have committed before its readback or cleanup failed. Acknowledge
  // that exact durable state without rewriting it; equal-size edits still fail.
  if (!ordinary && sameFinancialSnapshot(normalized, record.candidate.state))
    return { unchanged: true };
  if (
    !ordinary &&
    (next.utf16Units > allowance.utf16Units ||
      next.utf8Bytes > allowance.utf8Bytes ||
      next.utf8Bytes >= previous.utf8Bytes)
  )
    throw new Error(
      "Учёт превышает 5 МБ. Старый большой учёт можно только уменьшать.",
    );
  // The candidate factory checks the two bounds again and fixes the validation date.
  const current = new TextDecoder().decode(writeMeasuredJson(normalized, next));
  if (ordinary) return { raw: current, ordinary: true };
  const candidate = prepareRestoreCandidate(record.candidate, {
    normalizationDate: record.candidate.identity.normalizationDate,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: "rescue",
    currentSnapshotText: current,
    snapshotDate,
  });
  return {
    raw: frameRecovery(
      { ...record.metadata, snapshotDate },
      candidate.sourceText,
      restoreCandidateText(candidate),
    ),
    ordinary: false,
  };
}
export function recoveryInspection(
  record: RecoveryRecord,
  raw: string,
  format: LedgerSnapshotIdentity["format"],
  profileId: FinanceProfile,
  keyId?: string,
): Extract<LedgerInspection, { status: "readable" }> {
  const identity = record.metadata.initialIdentity;
  const snapshotIdentity: LedgerSnapshotIdentity = {
    format,
    recordFingerprint: fingerprintText(raw),
    sourceFingerprint: fingerprintText(record.currentText),
    ...(keyId ? { keyId } : {}),
  };
  const currentMatchesImport = sameFingerprint(
    record.candidate.identity.normalizedFingerprint,
    identity.normalizedFingerprint,
  );
  return {
    status: "readable",
    state: record.candidate.state,
    sourceText: record.currentText,
    snapshotIdentity,
    normalizationDate: identity.normalizationDate,
    normalizationVersion: 1,
    snapshotDate: record.metadata.snapshotDate,
    recovery: {
      anchorText: record.candidate.sourceText,
      normalizationDate: identity.normalizationDate,
      normalizationVersion: 1,
      allowance: record.candidate.identity.allowance,
    },
    ...(currentMatchesImport
      ? {
          importedSnapshot: {
            operationId: record.metadata.operationId,
            profileId,
            candidateIdentity: identity,
            snapshotIdentity,
          },
        }
      : {}),
  };
}
export function confirmImportedSnapshot(
  inspection: LedgerInspection,
  candidate: VerifiedRestoreCandidate,
  operationId: string,
) {
  assertVerifiedRestoreCandidate(candidate);
  if (
    inspection.status !== "readable" ||
    !inspection.importedSnapshot ||
    inspection.importedSnapshot.operationId !== operationId ||
    !sameRestoreIdentity(
      inspection.importedSnapshot.candidateIdentity,
      candidate.identity,
    ) ||
    !sameFinancialSnapshot(inspection.state, candidate.state)
  )
    throw new Error(
      "Не удалось подтвердить полный снимок восстановления. Существующие данные не заменены.",
    );
  return inspection.importedSnapshot;
}
