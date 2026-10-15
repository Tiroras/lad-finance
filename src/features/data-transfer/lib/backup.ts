import { MAX_BACKUP_BYTES, validateBackupValue } from "../../../domain/backup";
import type { BackupTransportFormat } from "../../../domain/dataTransfer";
import {
  measureJson,
  writeMeasuredJson,
} from "../../../domain/backupMeasurement";
import {
  MAX_RESCUE_SOURCE_BYTES,
  assertRestoreCandidateApplicable,
  prepareRestoreCandidate,
  type VerifiedRestoreCandidate,
} from "../../../domain/backupRecovery";
import { localDate } from "../../../domain/finance";
import type { BackupSourceResult } from "../../../state/finance";
import { pickBackupDocument } from "../../../infrastructure/files/backupDocument";
import type { BackupDocument } from "../../../infrastructure/files/backupDocumentReader";
import {
  fingerprintBackupParts,
  trackBackupFingerprint,
} from "../../../infrastructure/files/backupFingerprint";
import { shareFile } from "../../../infrastructure/files/shareFile";
import { backupCrypto } from "../../../infrastructure/crypto/backupCrypto";
import {
  decryptBackupSource,
  encryptBackup,
  parsePasswordEnvelope,
} from "../../../infrastructure/crypto/passwordBackup";
import {
  isRescueArchivePrefix,
  readRescueArchive,
  readRescueArchiveHeader,
  writeRescueArchive,
} from "../../../infrastructure/crypto/rescueArchive";

export interface VerifiedBackup {
  candidate: VerifiedRestoreCandidate;
  format: BackupTransportFormat;
  name: string;
  fingerprint: { sha256: string; byteLength: number };
}
export interface EncryptedBackup {
  name: string;
  unlock(password: string): Promise<VerifiedBackup>;
  close(): void;
}
export type PickedBackup =
  | { kind: "open"; backup: VerifiedBackup }
  | { kind: "encrypted"; selection: EncryptedBackup };

const prepare = (source: string, date: string) => {
  const candidate = prepareRestoreCandidate(source, {
    normalizationDate: date,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: "standard",
  });
  assertRestoreCandidateApplicable(candidate, localDate());
  return candidate;
};

async function readArchive(
  document: BackupDocument,
  password?: string,
): Promise<VerifiedBackup> {
  const tracked = trackBackupFingerprint(document);
  const candidate = await readRescueArchive(
    tracked.reader,
    password === undefined ? undefined : { password, crypto: backupCrypto },
  );
  assertRestoreCandidateApplicable(candidate, localDate());
  return {
    candidate,
    format: password === undefined ? "rescue-v2" : "password-v2",
    name: document.name,
    fingerprint: tracked.finish(),
  };
}

export async function pickBackup(): Promise<PickedBackup | null> {
  const document = await pickBackupDocument();
  if (!document) return null;
  let retained = false;
  try {
    const prefix = await document.read(0, Math.min(12, document.size));
    if (isRescueArchivePrefix(prefix)) {
      const header = await readRescueArchiveHeader(document);
      if (header.protection === "password") {
        retained = true;
        return {
          kind: "encrypted",
          selection: {
            name: document.name,
            unlock: (password) => readArchive(document, password),
            close: () => document.close(),
          },
        };
      }
      return { kind: "open", backup: await readArchive(document) };
    }
    if (document.size > MAX_RESCUE_SOURCE_BYTES)
      throw new Error(
        "Исходный JSON превышает 15 МБ. Выберите поддерживаемую копию Лада.",
      );
    const bytes = await document.read(0, document.size);
    let raw: string;
    let value: unknown;
    try {
      raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
      value = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("Не удалось прочитать файл резервной копии.");
    }
    const fingerprint = fingerprintBackupParts([bytes]);
    const name = document.name;
    const date = localDate();
    if (
      value &&
      typeof value === "object" &&
      "format" in value &&
      value.format === "lad-password-backup"
    ) {
      const envelope = raw.replace(/^\uFEFF/, "");
      parsePasswordEnvelope(envelope);
      let closed = false;
      return {
        kind: "encrypted",
        selection: {
          name,
          async unlock(password) {
            if (closed) throw new Error("Выберите копию ещё раз.");
            const source = await decryptBackupSource(
              envelope,
              password,
              backupCrypto,
            );
            return {
              candidate: prepare(source, date),
              format: "password-v1",
              name,
              fingerprint,
            };
          },
          close() {
            closed = true;
          },
        },
      };
    }
    return {
      kind: "open",
      backup: {
        candidate: prepare(raw, date),
        format: "json",
        name,
        fingerprint,
      },
    };
  } finally {
    if (!retained) document.close();
  }
}

export interface PreparedBackup {
  parts: readonly Uint8Array[];
  name: string;
  mimeType: string;
  encrypted: boolean;
  fingerprint: { sha256: string; byteLength: number };
}

export async function prepareBackup(
  source: BackupSourceResult,
  password?: string,
): Promise<PreparedBackup> {
  const state = validateBackupValue(
    JSON.parse(source.sourceText.replace(/^\uFEFF/, "")),
    source.snapshotDate,
  );
  const measured = measureJson(state);
  const rescue =
    measured.utf8Bytes > MAX_BACKUP_BYTES ||
    measured.utf16Units > MAX_BACKUP_BYTES;
  const encrypted = password !== undefined;
  let parts: Uint8Array[];
  if (rescue) {
    const currentSnapshotText = new TextDecoder().decode(
      writeMeasuredJson(state, measured),
    );
    parts = await writeRescueArchive(
      {
        sourceText: source.recovery?.anchorText ?? source.sourceText,
        currentSnapshotText,
        normalizationDate:
          source.recovery?.normalizationDate ?? source.normalizationDate,
        normalizationVersion: 1,
        snapshotDate: source.snapshotDate,
      },
      encrypted ? { password, crypto: backupCrypto } : undefined,
    );
  } else {
    parts = encrypted
      ? [
          new TextEncoder().encode(
            await encryptBackup(state, password, backupCrypto),
          ),
        ]
      : [writeMeasuredJson(state, measured)];
  }
  return {
    parts,
    name: `lad-backup-${localDate()}.${encrypted ? "ladbackup" : rescue ? "ladrescue" : "json"}`,
    mimeType:
      encrypted || rescue ? "application/octet-stream" : "application/json",
    encrypted,
    fingerprint: fingerprintBackupParts(parts),
  };
}

export const sharePreparedBackup = (backup: PreparedBackup) =>
  shareFile(backup.parts, backup.name, backup.mimeType);
