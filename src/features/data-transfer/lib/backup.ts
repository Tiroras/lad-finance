import { decodeBackup } from "../../../domain/backup";
import { localDate } from "../../../domain/finance";
import type { FinanceState } from "../../../domain/types";
import { pickDocument } from "../../../infrastructure/files/documents";
import { shareFile } from "../../../infrastructure/files/shareFile";
import { backupCrypto } from "../../../infrastructure/crypto/backupCrypto";
import {
  checkedBackupContent,
  decryptBackup,
  encryptBackup,
  MAX_ENCRYPTED_BACKUP_BYTES,
  MAX_PLAIN_BACKUP_BYTES,
  parsePasswordEnvelope,
} from "../../../infrastructure/crypto/passwordBackup";

export async function exportBackup(state: FinanceState, password?: string) {
  const encrypted = password !== undefined;
  const content = encrypted
    ? await encryptBackup(state, password, backupCrypto)
    : checkedBackupContent(state);
  await shareFile(
    content,
    `lad-backup-${localDate()}.${encrypted ? "ladbackup" : "json"}`,
    encrypted ? "application/octet-stream" : "application/json",
  );
}

export type PickedBackup =
  { kind: "open"; state: FinanceState } | { kind: "encrypted"; raw: string };
export async function pickBackup(): Promise<PickedBackup | null> {
  const file = await pickDocument(
    ["json", "ladbackup"],
    MAX_ENCRYPTED_BACKUP_BYTES,
  );
  if (!file) return null;
  const raw = new TextDecoder().decode(file.bytes);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Не удалось прочитать файл резервной копии.");
  }
  if (
    value &&
    typeof value === "object" &&
    "format" in value &&
    value.format === "lad-password-backup"
  ) {
    parsePasswordEnvelope(raw);
    return { kind: "encrypted", raw };
  }
  if (file.bytes.length > MAX_PLAIN_BACKUP_BYTES)
    throw new Error("Открытая копия должна быть не больше 5 МБ.");
  return { kind: "open", state: decodeBackup(raw) };
}
export const unlockBackup = (raw: string, password: string) =>
  decryptBackup(raw, password, backupCrypto);
