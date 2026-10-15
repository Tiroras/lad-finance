import { validateBackupValue } from "../../domain/backup";
import {
  fingerprintFinanceState,
  sameFingerprint,
} from "../../domain/backupRecovery";
import type { FinanceProfile } from "../../domain/profiles";
import type { FinanceState } from "../../domain/types";
import type {
  LedgerInspection,
  LedgerRecoveryAnchor,
  LedgerSnapshotIdentity,
} from "../../infrastructure/storage/ledgerContracts";

export interface BackupSource {
  profileId: FinanceProfile;
  profileName: string;
  capturedRevision: number;
  sourceRevision: number | null;
  sourceText: string;
  snapshotIdentity: LedgerSnapshotIdentity;
  normalizationDate: string;
  normalizationVersion: 1;
  snapshotDate: string;
  recovery?: LedgerRecoveryAnchor;
}
export type BackupSourceResult = BackupSource &
  (
    | { kind: "current" }
    | {
        kind: "last-readable-saved";
        reason: "save-failed" | "revision-unconfirmed";
      }
  );

/** The caller holds the provider operation barrier for this whole capture. */
export async function captureBackupSource({
  profileId,
  profileName,
  state,
  revision,
  today,
  save,
  inspect,
}: {
  profileId: FinanceProfile;
  profileName: string;
  state: FinanceState;
  revision: number;
  today: string;
  save: () => Promise<void>;
  inspect: (options: {
    normalizationDate: string;
  }) => Promise<LedgerInspection>;
}): Promise<BackupSourceResult> {
  let acknowledged = true;
  try {
    await save();
  } catch {
    acknowledged = false;
  }
  const source = await inspect({ normalizationDate: today });
  if (source.status !== "readable")
    throw new Error(
      "Нет читаемого сохранённого снимка. Повторите сохранение или восстановите исходную копию; пустой файл не создан.",
    );
  if (source.state.demo !== (profileId === "demo"))
    throw new Error("Сохранённый снимок относится к другому профилю.");
  let matches = false;
  try {
    const captured = validateBackupValue(state, source.snapshotDate);
    matches = sameFingerprint(
      fingerprintFinanceState(captured),
      fingerprintFinanceState(source.state),
    );
  } catch {
    // An older rescue snapshot can have an older validation date than an unsaved edit.
    // Its readable source remains eligible for the explicitly named fallback.
  }
  const current = acknowledged && matches;
  return {
    profileId,
    profileName,
    capturedRevision: revision,
    sourceRevision: current ? revision : null,
    sourceText: source.sourceText,
    snapshotIdentity: source.snapshotIdentity,
    normalizationDate: source.normalizationDate,
    normalizationVersion: source.normalizationVersion,
    snapshotDate: source.snapshotDate,
    ...(source.recovery ? { recovery: source.recovery } : {}),
    ...(current
      ? { kind: "current" as const }
      : {
          kind: "last-readable-saved" as const,
          reason: acknowledged
            ? ("revision-unconfirmed" as const)
            : ("save-failed" as const),
        }),
  };
}
