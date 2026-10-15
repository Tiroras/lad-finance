import { assertProfileId, type FinanceProfile } from "../../domain/profiles";
import { VAULT_STORAGE_KEY } from "./vault";

export const CIPHERTEXT_FILE_FORMAT = "lad-ciphertext-file";
// Allocation ceiling only, not financial authority. Normalization v1 accepts
// <=5M source UTF-16 units /15M UTF-8 bytes. Its ASCII numeric expansion plus
// <=200 startsOn defaults and scenarios/demo defaults bounds normalized UTF-8
// at 20,004,816 bytes. Source + current + recovery headers + GCM/base64 envelope
// is <46.7MB (vault.maximumEnvelope); 64MB covers all accepted v1 migrations.
// The vault still enforces the smaller, source-derived permit for each record.
export const MAX_CIPHERTEXT_FILE_BYTES = 64_000_000;
const KEY_ID = /^[a-zA-Z0-9-]{1,80}$/;
const GENERATION =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface CiphertextPointer {
  format: typeof CIPHERTEXT_FILE_FORMAT;
  version: 1;
  profileId: FinanceProfile;
  fileName: string;
  bytes: number;
  sha256: string;
  keyId: string;
}

export interface EncryptedFileStorageDependencies {
  profile: FinanceProfile;
  metadata: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<unknown>;
    removeItem(key: string): Promise<unknown>;
  };
  /** All names are validated basenames within this profile's owned directory. */
  files: {
    /** Must exclusively create a new generation and close it before resolving. */
    writeNew(name: string, value: string): Promise<void>;
    /** Check exact on-disk length before allocating/reading its contents. */
    read(name: string, expectedBytes: number): Promise<string>;
    remove(name: string): Promise<void>;
  };
  sha256(value: string): Promise<string>;
  randomId(): string;
}

const invalid = () =>
  new Error("Не удалось проверить файл зашифрованного учёта.");

export function ciphertextGenerationKeyId(name: string): string | null {
  const parts = name.split(".");
  return parts.length === 3 &&
    KEY_ID.test(parts[0]) &&
    GENERATION.test(parts[1]) &&
    parts[2] === "vault"
    ? parts[0]
    : null;
}

/** Null means a historical inline envelope, never an absent/corrupt file. */
export function parseCiphertextPointer(
  raw: string,
  profile: FinanceProfile,
): CiphertextPointer | null {
  assertProfileId(profile);
  const value = JSON.parse(raw);
  if (value?.format === "lad-aes-gcm") return null;
  if (
    raw.length > 2048 ||
    value?.format !== CIPHERTEXT_FILE_FORMAT ||
    value.version !== 1 ||
    value.profileId !== profile ||
    typeof value.fileName !== "string" ||
    typeof value.keyId !== "string" ||
    ciphertextGenerationKeyId(value.fileName) !== value.keyId ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes <= 0 ||
    value.bytes > MAX_CIPHERTEXT_FILE_BYTES ||
    typeof value.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    Object.keys(value).sort().join() !==
      "bytes,fileName,format,keyId,profileId,sha256,version"
  )
    throw invalid();
  return value;
}

function ciphertextKeyId(raw: string): string {
  // The current vault serializes ASCII JSON containing only base64 ciphertext.
  // Refuse plaintext, unexpected fields and unbounded allocations here too.
  if (raw.length > MAX_CIPHERTEXT_FILE_BYTES || /[^\x20-\x7e]/.test(raw))
    throw invalid();
  const value = JSON.parse(raw);
  if (
    value?.format !== "lad-aes-gcm" ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.keyId !== "string" ||
    !KEY_ID.test(value.keyId) ||
    typeof value.sealed !== "string" ||
    !/^[A-Za-z0-9+/]+=*$/.test(value.sealed) ||
    Object.keys(value).sort().join() !== "format,keyId,sealed,version"
  )
    throw invalid();
  return value.keyId;
}

// Every instance in this JS runtime shares the profile lock, including readers.
// A reader must finish before a writer can remove its previous generation.
const pending = new Map<FinanceProfile, Promise<unknown>>();
function serialized<T>(
  profile: FinanceProfile,
  action: () => Promise<T>,
): Promise<T> {
  const result = (pending.get(profile) ?? Promise.resolve())
    .catch(() => {})
    .then(action);
  pending.set(profile, result);
  void result
    .finally(() => {
      if (pending.get(profile) === result) pending.delete(profile);
    })
    .catch(() => {});
  return result;
}

/** Ciphertext physical storage only; financial validation remains in createVault. */
export function createEncryptedFileStorage({
  profile,
  metadata,
  files,
  sha256,
  randomId,
}: EncryptedFileStorageDependencies) {
  assertProfileId(profile);
  async function readPointer(pointer: CiphertextPointer) {
    const raw = await files.read(pointer.fileName, pointer.bytes);
    if (
      raw.length !== pointer.bytes ||
      (await sha256(raw)) !== pointer.sha256 ||
      ciphertextKeyId(raw) !== pointer.keyId
    )
      throw invalid();
    return raw;
  }
  return {
    getItem(key: string): Promise<string | null> {
      if (key !== VAULT_STORAGE_KEY) return metadata.getItem(key);
      return serialized(profile, async () => {
        const raw = await metadata.getItem(key);
        if (raw === null) return null;
        const pointer = parseCiphertextPointer(raw, profile);
        return pointer ? readPointer(pointer) : raw;
      });
    },
    setItem(key: string, value: string): Promise<unknown> {
      if (key !== VAULT_STORAGE_KEY) return metadata.setItem(key, value);
      return serialized(profile, async () => {
        const keyId = ciphertextKeyId(value);
        const previousRaw = await metadata.getItem(key);
        let previous: CiphertextPointer | null = null;
        try {
          previous =
            previousRaw === null
              ? null
              : parseCiphertextPointer(previousRaw, profile);
        } catch {
          // Explicit bounded recovery can replace damaged metadata. Its unknown
          // files are retained; normal vault save/load still fail closed.
        }
        const generation = randomId();
        if (!GENERATION.test(generation)) throw invalid();
        const pointer: CiphertextPointer = {
          format: CIPHERTEXT_FILE_FORMAT,
          version: 1,
          profileId: profile,
          fileName: `${keyId}.${generation}.vault`,
          bytes: value.length,
          sha256: await sha256(value),
          keyId,
        };
        const pointerRaw = JSON.stringify(pointer);
        parseCiphertextPointer(pointerRaw, profile);
        await files.writeNew(pointer.fileName, value);
        if ((await readPointer(pointer)) !== value) throw invalid();
        // SQLite commits this small pointer atomically. Never overwrite a file.
        // Close + readback proves process-level visibility, not power-loss fsync.
        await metadata.setItem(key, pointerRaw);
        if (
          (await metadata.getItem(key)) !== pointerRaw ||
          (await readPointer(pointer)) !== value
        )
          throw invalid();
        // On any uncertain commit both generations remain. An orphan is never
        // selected as current and is removed only by an explicit Fresh reset.
        if (previous && previous.fileName !== pointer.fileName) {
          try {
            await files.remove(previous.fileName);
          } catch {
            /* Already committed. */
          }
        }
      });
    },
    removeItem(key: string): Promise<unknown> {
      if (key !== VAULT_STORAGE_KEY) return metadata.removeItem(key);
      return serialized(profile, async () => {
        const raw = await metadata.getItem(key);
        const pointer =
          raw === null ? null : parseCiphertextPointer(raw, profile);
        await metadata.removeItem(key);
        if ((await metadata.getItem(key)) !== null) throw invalid();
        if (pointer) {
          try {
            await files.remove(pointer.fileName);
          } catch {
            /* Removed logical record. */
          }
        }
      });
    },
  };
}
