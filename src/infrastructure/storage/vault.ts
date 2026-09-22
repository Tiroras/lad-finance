import {
  backupByteLength,
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
  MAX_BACKUP_BYTES,
} from "../../domain/backup";
import type { FinanceState } from "../../domain/types";

export const LEGACY_STORAGE_KEY = "lad-finance-v1";
export const VAULT_STORAGE_KEY = "lad-finance-encrypted-v1";
const CONTEXT = "app.lad.finance/vault/1";
interface Key {
  id: string;
  secret: string;
}
interface Envelope {
  format: "lad-aes-gcm";
  version: 1;
  keyId: string;
  sealed: string;
}
export interface VaultDependencies {
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<unknown>;
    removeItem(key: string): Promise<unknown>;
  };
  keys: {
    get(id: string): Promise<string | null>;
    create(): Promise<Key>;
    remove(id: string): Promise<unknown>;
  };
  cipher: {
    seal(plain: string, secret: string, context: string): Promise<string>;
    open(sealed: string, secret: string, context: string): Promise<string>;
  };
}
function envelope(raw: string): Envelope {
  // Historical snapshots allowed 5M UTF-16 characters (up to 15M UTF-8 bytes).
  // Keep them readable and allow gradual reduction. New ledgers have a 5MB cap.
  if (raw.length > 20_001_000)
    throw new Error("Зашифрованное хранилище слишком большое.");
  const value = JSON.parse(raw);
  if (
    value?.format !== "lad-aes-gcm" ||
    value.version !== 1 ||
    typeof value.keyId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(value.keyId) ||
    typeof value.sealed !== "string" ||
    !/^[A-Za-z0-9+/]+=*$/.test(value.sealed)
  )
    throw new Error("Неизвестный или повреждённый формат хранилища.");
  return value;
}

export function createVault({ storage, keys, cipher }: VaultDependencies) {
  let cachedKey: Key | null = null;
  let previousBytes = 0;
  async function readEncrypted(raw: string) {
    const payload = envelope(raw);
    const secret = await keys.get(payload.keyId);
    if (!secret)
      throw new Error(
        "Ключ устройства недоступен. Разблокируйте телефон или восстановите резервную копию.",
      );
    const plain = await cipher.open(
      payload.sealed,
      secret,
      `${CONTEXT}/${payload.keyId}`,
    );
    const state = decodeBackup(plain);
    cachedKey = { id: payload.keyId, secret };
    previousBytes = backupByteLength(encodeBackup(state));
    return { state, plain };
  }
  async function write(
    state: FinanceState,
    key: Key,
    legacy = false,
    allowance = previousBytes,
  ) {
    const plain = legacy
      ? encodeBackup(state)
      : checkedBackupContent(state, allowance);
    if (legacy) decodeBackup(plain);
    const context = `${CONTEXT}/${key.id}`;
    const sealed = await cipher.seal(plain, key.secret, context);
    if ((await cipher.open(sealed, key.secret, context)) !== plain)
      throw new Error("Проверка шифрования не пройдена.");
    const raw = JSON.stringify({
      format: "lad-aes-gcm",
      version: 1,
      keyId: key.id,
      sealed,
    } satisfies Envelope);
    envelope(raw);
    await storage.setItem(VAULT_STORAGE_KEY, raw);
    if ((await storage.getItem(VAULT_STORAGE_KEY)) !== raw)
      throw new Error("Не удалось проверить запись зашифрованных данных.");
    cachedKey = key;
    // Only remove the legacy plaintext after the encrypted copy is durable and verified.
    await storage.removeItem(LEGACY_STORAGE_KEY);
    previousBytes = backupByteLength(plain);
  }
  return {
    async load(): Promise<FinanceState | null> {
      const encrypted = await storage.getItem(VAULT_STORAGE_KEY);
      if (encrypted !== null) {
        // Fail closed: never fall back to a potentially stale plaintext copy.
        const { state } = await readEncrypted(encrypted);
        await storage.removeItem(LEGACY_STORAGE_KEY);
        return state;
      }
      const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
      if (legacy === null) return null;
      const state = decodeBackup(legacy);
      await write(state, await keys.create(), true);
      return state;
    },
    async save(state: FinanceState) {
      if (!cachedKey) {
        const existing = await storage.getItem(VAULT_STORAGE_KEY);
        if (existing !== null) await readEncrypted(existing);
        else {
          const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
          if (legacy !== null)
            previousBytes = backupByteLength(
              encodeBackup(decodeBackup(legacy)),
            );
          cachedKey = await keys.create();
        }
      }
      await write(state, cachedKey!);
    },
    async recover(state: FinanceState) {
      // Each key has an ID: an interrupted recovery cannot replace the key
      // needed to decrypt the previous ciphertext.
      const previous = await storage.getItem(VAULT_STORAGE_KEY);
      let allowance = 0;
      let alreadyStored = false;
      try {
        if (previous !== null) {
          const { plain } = await readEncrypted(previous);
          allowance = previousBytes;
          alreadyStored =
            allowance > MAX_BACKUP_BYTES && plain === encodeBackup(state);
        } else {
          const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
          if (legacy !== null)
            allowance = backupByteLength(encodeBackup(decodeBackup(legacy)));
        }
      } catch {
        /* Unreadable data grants no allowance to exceed the new snapshot limit. */
      }
      if (alreadyStored) {
        // A recovery may have committed before legacy cleanup failed. Retrying
        // that exact snapshot completes cleanup without a new oversized write.
        await storage.removeItem(LEGACY_STORAGE_KEY);
        return;
      }
      checkedBackupContent(state, allowance);
      const key = await keys.create();
      await write(state, key, false, allowance);
      if (previous) {
        try {
          const oldId = envelope(previous).keyId;
          if (oldId !== key.id) await keys.remove(oldId);
        } catch {
          /* Recovery already committed; old key cleanup is best effort. */
        }
      }
    },
  };
}
