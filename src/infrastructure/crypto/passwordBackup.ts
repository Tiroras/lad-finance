import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  checkedBackupContent,
  decodeBackup,
  MAX_BACKUP_BYTES,
} from "../../domain/backup";
import type { FinanceState } from "../../domain/types";

export const BACKUP_ITERATIONS = 600_000;
export const MAX_PLAIN_BACKUP_BYTES = MAX_BACKUP_BYTES;
export { checkedBackupContent } from "../../domain/backup";
export const MAX_ENCRYPTED_BACKUP_BYTES = 10_001_000;
export interface BackupCrypto {
  random(length: number): Uint8Array;
  derive(
    password: string,
    salt: Uint8Array,
    iterations: number,
  ): Promise<Uint8Array>;
  seal(
    plain: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array,
    context: Uint8Array,
  ): Promise<Uint8Array>;
  open(
    sealed: Uint8Array,
    key: Uint8Array,
    context: Uint8Array,
  ): Promise<Uint8Array>;
}
export interface PasswordEnvelope {
  format: "lad-password-backup";
  version: 1;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: typeof BACKUP_ITERATIONS;
  salt: string;
  // Hex encoding of nonce (12 bytes) || ciphertext || authentication tag (16 bytes).
  sealed: string;
}
const utf8 = new TextEncoder();
const context = (salt: string) =>
  utf8.encode(
    `lad-password-backup/1/AES-256-GCM/PBKDF2-SHA256/${BACKUP_ITERATIONS}/${salt}`,
  );

export function parsePasswordEnvelope(raw: string): PasswordEnvelope {
  if (raw.length > MAX_ENCRYPTED_BACKUP_BYTES)
    throw new Error("Файл резервной копии слишком большой.");
  let value: PasswordEnvelope;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Не удалось прочитать защищённую копию.");
  }
  if (
    value?.format !== "lad-password-backup" ||
    value.version !== 1 ||
    value.cipher !== "AES-256-GCM" ||
    value.kdf !== "PBKDF2-SHA256" ||
    value.iterations !== BACKUP_ITERATIONS ||
    typeof value.salt !== "string" ||
    !/^[0-9a-f]{32}$/.test(value.salt) ||
    typeof value.sealed !== "string" ||
    value.sealed.length < 58 ||
    value.sealed.length > (MAX_PLAIN_BACKUP_BYTES + 28) * 2 ||
    value.sealed.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(value.sealed)
  )
    throw new Error(
      "Неизвестная версия или повреждённый формат защищённой копии.",
    );
  return value;
}

export function validateBackupPassword(password: string, creating = true) {
  if (
    password.length > 256 ||
    password.length < (creating ? 10 : 1) ||
    (creating && password.trim().length < 10)
  )
    throw new Error(
      "Пароль должен содержать от 10 до 256 символов, не только пробелы.",
    );
}

export async function encryptBackup(
  state: FinanceState,
  password: string,
  crypto: BackupCrypto,
) {
  validateBackupPassword(password);
  const plain = utf8.encode(checkedBackupContent(state));
  let key: Uint8Array | undefined;
  try {
    const salt = crypto.random(16),
      nonce = crypto.random(12),
      saltHex = bytesToHex(salt);
    key = await crypto.derive(password, salt, BACKUP_ITERATIONS);
    const sealed = await crypto.seal(plain, key, nonce, context(saltHex));
    return JSON.stringify({
      format: "lad-password-backup",
      version: 1,
      cipher: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: BACKUP_ITERATIONS,
      salt: saltHex,
      sealed: bytesToHex(sealed),
    } satisfies PasswordEnvelope);
  } finally {
    key?.fill(0);
    plain.fill(0);
  }
}

/** Authenticate v1 and retain its exact source for the shared restore factory. */
export async function decryptBackupSource(
  raw: string,
  password: string,
  crypto: BackupCrypto,
): Promise<string> {
  const envelope = parsePasswordEnvelope(raw);
  validateBackupPassword(password, false);
  const key = await crypto.derive(
    password,
    hexToBytes(envelope.salt),
    BACKUP_ITERATIONS,
  );
  let plain: Uint8Array;
  try {
    plain = await crypto.open(
      hexToBytes(envelope.sealed),
      key,
      context(envelope.salt),
    );
  } catch {
    throw new Error("Пароль неверный или файл повреждён. Данные не изменены.");
  } finally {
    key.fill(0);
  }
  try {
    if (plain.length < 1 || plain.length > MAX_PLAIN_BACKUP_BYTES)
      throw new Error("Файл резервной копии слишком большой.");
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        plain,
      );
    } catch {
      throw new Error("Не удалось прочитать защищённую копию.");
    }
  } finally {
    plain.fill(0);
  }
}

export async function decryptBackup(
  raw: string,
  password: string,
  crypto: BackupCrypto,
): Promise<FinanceState> {
  const source = await decryptBackupSource(raw, password, crypto);
  // The original v1 TextDecoder consumed a UTF-8 BOM. Keep that compatibility
  // here, while the source API retains every decoded character for its caller.
  return decodeBackup(
    source.charCodeAt(0) === 0xfeff ? source.slice(1) : source,
  );
}
