import { Directory, File, FileMode, Paths } from "expo-file-system";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";
import {
  assertProfileId,
  isFinanceProfile,
  type FinanceProfile,
} from "../../domain/profiles";
import {
  ciphertextGenerationKeyId,
  createEncryptedFileStorage,
  MAX_CIPHERTEXT_FILE_BYTES,
  type EncryptedFileStorageDependencies,
} from "./encryptedFileStorage";

const root = () => new Directory(Paths.document, "lad-ciphertext-v1");
function profileDirectory(profile: FinanceProfile) {
  assertProfileId(profile);
  return new Directory(root(), profile);
}
function generationFile(profile: FinanceProfile, name: string) {
  if (!ciphertextGenerationKeyId(name))
    throw new Error("Неверное имя файла учёта.");
  return new File(profileDirectory(profile), name);
}

export function createNativeEncryptedFileStorage(
  profile: FinanceProfile,
  metadata: EncryptedFileStorageDependencies["metadata"],
) {
  return createEncryptedFileStorage({
    profile,
    metadata,
    randomId: randomUUID,
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
    files: {
      async writeNew(name, value) {
        const directory = profileDirectory(profile);
        directory.create({ intermediates: true, idempotent: true });
        const file = generationFile(profile, name);
        // No overwrite/move: an interrupted write cannot damage the old generation.
        file.create({ overwrite: false });
        const handle = file.open(FileMode.WriteOnly);
        try {
          // Vault envelopes are ASCII. Bound each temporary byte buffer.
          const encoder = new TextEncoder();
          for (let offset = 0; offset < value.length; offset += 262_144)
            await handle.writeBytes(
              encoder.encode(value.slice(offset, offset + 262_144)),
            );
          if (handle.size !== value.length)
            throw new Error("Не удалось полностью записать учёт.");
        } finally {
          handle.close();
        }
      },
      async read(name, expectedBytes) {
        if (
          !Number.isSafeInteger(expectedBytes) ||
          expectedBytes <= 0 ||
          expectedBytes > MAX_CIPHERTEXT_FILE_BYTES
        )
          throw new Error("Неверный размер файла учёта.");
        const file = generationFile(profile, name);
        if (!file.exists || file.size !== expectedBytes)
          throw new Error("Файл сохранённого учёта отсутствует или повреждён.");
        const handle = file.open(FileMode.ReadOnly);
        try {
          if (handle.size !== expectedBytes)
            throw new Error("Размер файла учёта изменился.");
          const parts: string[] = [];
          const decoder = new TextDecoder("utf-8", { fatal: true });
          for (let offset = 0; offset < expectedBytes; offset += 262_144) {
            const length = Math.min(262_144, expectedBytes - offset);
            const bytes = await handle.readBytes(length);
            if (bytes.length !== length)
              throw new Error("Не удалось полностью прочитать учёт.");
            parts.push(decoder.decode(bytes));
          }
          if (handle.size !== expectedBytes)
            throw new Error("Размер файла учёта изменился.");
          return parts.join("");
        } finally {
          handle.close();
        }
      },
      async remove(name) {
        const file = generationFile(profile, name);
        if (file.exists) file.delete();
      },
    },
  });
}

/** Fresh alone may enumerate and remove orphan generations; never read their contents. */
export function listCiphertextKeysForReset(): {
  profile: FinanceProfile;
  keyId: string | null;
}[] {
  const directory = root();
  if (!directory.exists) return [];
  const result: { profile: FinanceProfile; keyId: string | null }[] = [];
  for (const profile of directory.list()) {
    if (!(profile instanceof Directory) || !isFinanceProfile(profile.name))
      continue;
    result.push({ profile: profile.name, keyId: null });
    for (const file of profile.list()) {
      if (!(file instanceof File)) continue;
      const keyId = ciphertextGenerationKeyId(file.name);
      if (keyId) result.push({ profile: profile.name, keyId });
    }
  }
  return result;
}

export function removeCiphertextFilesForReset() {
  // Fixed app-owned root; no path is obtained from untrusted pointer metadata.
  const directory = root();
  if (directory.exists) directory.delete();
}
