import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { BackupDocument } from "./backupDocumentReader";

export function fingerprintBackupParts(parts: readonly Uint8Array[]) {
  const hash = sha256.create();
  let byteLength = 0;
  for (const part of parts) {
    hash.update(part);
    byteLength += part.length;
    if (!Number.isSafeInteger(byteLength))
      throw new Error("Файл копии слишком большой.");
  }
  return { sha256: bytesToHex(hash.digest()), byteLength };
}

// Hash exactly the bytes that the format reader validates, in its bounded order.
// A second read of a mutable file could confirm different bytes.
export function trackBackupFingerprint(document: BackupDocument) {
  const hash = sha256.create();
  let position = 0;
  return {
    reader: {
      size: document.size,
      async read(offset: number, length: number) {
        if (offset !== position)
          throw new Error("Нарушен порядок проверки файла копии.");
        const bytes = await document.read(offset, length);
        if (bytes.length !== length)
          throw new Error("Не удалось полностью прочитать файл копии.");
        hash.update(bytes);
        position += length;
        return bytes;
      },
    },
    finish() {
      if (position !== document.size)
        throw new Error("Файл копии проверен не полностью.");
      return { sha256: bytesToHex(hash.digest()), byteLength: position };
    },
  };
}
