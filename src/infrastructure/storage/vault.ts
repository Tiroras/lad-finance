import {
  backupByteLength,
  checkedBackupContent,
  decodeBackup,
  encodeBackup,
  MAX_BACKUP_BYTES,
} from "../../domain/backup";
import type { FinanceState } from "../../domain/types";
import {
  assertVerifiedRestoreCandidate,
  fingerprintText,
  sameRestoreIdentity,
  type VerifiedRestoreCandidate,
} from "../../domain/backupRecovery";
import { localDate } from "../../domain/finance";
import type { FinanceProfile } from "../../domain/profiles";
import type { LedgerInspection, LedgerInspectOptions } from "./ledgerContracts";
import {
  confirmImportedSnapshot,
  MAX_RECOVERY_HEADER,
  parseRecoveryMetadata,
  readRecoveryRecord,
  recoveryInspection,
  updateRecoveryRecord,
  writeRecoveryRecord,
  type RecoveryMetadata,
  type RecoveryRecord,
} from "./recoveryLedger";

export const LEGACY_STORAGE_KEY = "lad-finance-v1";
export const VAULT_STORAGE_KEY = "lad-finance-encrypted-v1";
const CONTEXT = "app.lad.finance/vault/1";
interface Key {
  id: string;
  secret: string;
}
interface Envelope {
  format: "lad-aes-gcm";
  version: 1 | 2;
  keyId: string;
  sealed: string;
}
export interface VaultDependencies {
  profileId?: FinanceProfile;
  /** Small profile-scoped metadata kept in the device secure store. */
  allowances?: {
    get(): Promise<string | null>;
    set(value: string): Promise<unknown>;
    remove(): Promise<unknown>;
  };
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
function envelope(raw: string, maximum = 20_001_000): Envelope {
  // Historical snapshots allowed 5M UTF-16 characters (up to 15M UTF-8 bytes).
  // Keep them readable and allow gradual reduction. New ledgers have a 5MB cap.
  if (raw.length > maximum)
    throw new Error("Зашифрованное хранилище слишком большое.");
  const value = JSON.parse(raw);
  if (
    value?.format !== "lad-aes-gcm" ||
    (value.version !== 1 && value.version !== 2) ||
    (value.version === 1 && raw.length > 20_001_000) ||
    typeof value.keyId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(value.keyId) ||
    typeof value.sealed !== "string" ||
    !/^[A-Za-z0-9+/]+=*$/.test(value.sealed)
  )
    throw new Error("Неизвестный или повреждённый формат хранилища.");
  return value;
}

interface Permit {
  version: 1;
  keyId: string;
  metadata: RecoveryMetadata;
}
class InspectionFailure extends Error {
  constructor(
    readonly result: Exclude<
      LedgerInspection,
      { status: "readable" } | { status: "missing" }
    >,
    message: string,
  ) {
    super(message);
  }
}
const failed = (
  result: InspectionFailure["result"],
  message: string,
): never => {
  throw new InspectionFailure(result, message);
};
function parsePermit(raw: string): Permit {
  if (raw.length > MAX_RECOVERY_HEADER)
    throw new Error("Повреждено разрешение восстановления.");
  const value = JSON.parse(raw);
  if (
    value?.version !== 1 ||
    typeof value.keyId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(value.keyId) ||
    Object.keys(value).sort().join() !== "keyId,metadata,version"
  )
    throw new Error("Повреждено разрешение восстановления.");
  return {
    version: 1,
    keyId: value.keyId,
    metadata: parseRecoveryMetadata(value.metadata),
  };
}
function maximumEnvelope(permit: Permit) {
  const id = permit.metadata.initialIdentity;
  return (
    Math.ceil(
      (id.sourceFingerprint.utf8Bytes +
        id.allowance.utf8Bytes +
        MAX_RECOVERY_HEADER * 3 +
        100 +
        28) /
        3,
    ) *
      4 +
    1000
  );
}

export function createVault({
  storage,
  keys,
  cipher,
  allowances,
  profileId = "personal",
}: VaultDependencies) {
  let cachedKey: Key | null = null;
  let previousBytes = 0;
  async function readPermit() {
    let raw: string | null;
    try {
      raw = allowances ? await allowances.get() : null;
    } catch {
      return failed(
        { status: "unavailable", reason: "storage" },
        "Не удалось прочитать условия восстановления.",
      );
    }
    if (raw === null)
      return failed(
        { status: "unavailable", reason: "rescue-source-required" },
        "Для чтения восстановленного учёта нужен проверенный исходник.",
      );
    try {
      return parsePermit(raw);
    } catch {
      return failed(
        { status: "damaged", reason: "rescue-allowance" },
        "Повреждены условия восстановления.",
      );
    }
  }
  async function readRecord(raw: string, date = localDate()) {
    let permit: Permit | undefined;
    if (raw.length > 20_001_000) permit = await readPermit();
    let payload: Envelope;
    try {
      payload = envelope(raw, permit ? maximumEnvelope(permit) : undefined);
    } catch {
      return failed(
        { status: "damaged", reason: "envelope" },
        "Неизвестный или повреждённый формат хранилища.",
      );
    }
    if (payload.version === 2) {
      permit ??= await readPermit();
      if (
        payload.keyId !== permit.keyId ||
        raw.length > maximumEnvelope(permit)
      )
        return failed(
          { status: "damaged", reason: "rescue-allowance" },
          "Условия восстановления не соответствуют снимку.",
        );
    }
    let secret: string | null;
    try {
      secret = await keys.get(payload.keyId);
    } catch {
      return failed(
        { status: "unavailable", reason: "key" },
        "Ключ устройства недоступен.",
      );
    }
    if (!secret)
      return failed(
        { status: "unavailable", reason: "key" },
        "Ключ устройства недоступен. Разблокируйте телефон или восстановите резервную копию.",
      );
    let plain: string;
    try {
      plain = await cipher.open(
        payload.sealed,
        secret,
        `${payload.version === 2 ? CONTEXT + "/recovery" : CONTEXT}/${payload.keyId}`,
      );
    } catch {
      return failed(
        { status: "unavailable", reason: "decryption" },
        "Не удалось расшифровать сохранённый учёт.",
      );
    }
    let recovery: RecoveryRecord | undefined;
    let state: FinanceState;
    try {
      if (payload.version === 2) {
        recovery = readRecoveryRecord(plain);
        const metadata = recovery.metadata;
        if (
          metadata.operationId !== permit!.metadata.operationId ||
          metadata.sourceUnits !== permit!.metadata.sourceUnits ||
          !sameRestoreIdentity(
            metadata.initialIdentity,
            permit!.metadata.initialIdentity,
          )
        )
          throw new Error("Allowance mismatch");
        state = recovery.candidate.state;
      } else state = decodeBackup(plain, date);
    } catch {
      return failed(
        {
          status: "damaged",
          reason: payload.version === 2 ? "rescue-allowance" : "financial-json",
        },
        "Сохранённый учёт повреждён.",
      );
    }
    return { state, plain, key: { id: payload.keyId, secret }, recovery };
  }
  async function readEncrypted(raw: string) {
    const result = await readRecord(raw);
    cachedKey = result.key;
    const { state } = result;
    previousBytes = backupByteLength(encodeBackup(state));
    return result;
  }
  const inspect = async (
    options: LedgerInspectOptions = {},
  ): Promise<LedgerInspection> => {
    let raw: string | null;
    try {
      raw = await storage.getItem(VAULT_STORAGE_KEY);
    } catch {
      return { status: "unavailable", reason: "storage" };
    }
    const date = options.normalizationDate ?? localDate();
    if (raw !== null) {
      try {
        const result = await readRecord(raw, date);
        if (result.recovery)
          return recoveryInspection(
            result.recovery,
            raw,
            "rescue-vault-v1",
            profileId,
            result.key.id,
          );
        return {
          status: "readable",
          state: result.state,
          sourceText: result.plain,
          snapshotIdentity: {
            format: "vault-v1",
            recordFingerprint: fingerprintText(raw),
            sourceFingerprint: fingerprintText(result.plain),
            keyId: result.key.id,
          },
          normalizationDate: date,
          normalizationVersion: 1,
          snapshotDate: date,
        };
      } catch (error) {
        return error instanceof InspectionFailure
          ? error.result
          : { status: "unavailable", reason: "storage" };
      }
    }
    let legacy: string | null;
    try {
      legacy = await storage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return { status: "unavailable", reason: "storage" };
    }
    if (legacy === null) return { status: "missing" };
    try {
      return {
        status: "readable",
        state: decodeBackup(legacy, date),
        sourceText: legacy,
        snapshotIdentity: {
          format: "plaintext",
          recordFingerprint: fingerprintText(legacy),
          sourceFingerprint: fingerprintText(legacy),
        },
        normalizationDate: date,
        normalizationVersion: 1,
        snapshotDate: date,
      };
    } catch {
      return { status: "damaged", reason: "financial-json" };
    }
  };
  async function writeRecovery(plain: string, key: Key) {
    if (!allowances)
      throw new Error("Защищённые условия восстановления недоступны.");
    const recovery = readRecoveryRecord(plain);
    const permit = {
      version: 1,
      keyId: key.id,
      metadata: recovery.metadata,
    } satisfies Permit;
    const context = `${CONTEXT}/recovery/${key.id}`;
    const sealed = await cipher.seal(plain, key.secret, context);
    if ((await cipher.open(sealed, key.secret, context)) !== plain)
      throw new Error("Проверка шифрования не пройдена.");
    const raw = JSON.stringify({
      format: "lad-aes-gcm",
      version: 2,
      keyId: key.id,
      sealed,
    } satisfies Envelope);
    envelope(raw, maximumEnvelope(permit));
    const permitText = JSON.stringify(permit);
    parsePermit(permitText);
    // The immutable permit is installed before the first ciphertext. Subsequent
    // shrinking writes keep it unchanged, so a failed commit preserves old data.
    const existingPermit = await allowances.get();
    if (existingPermit !== null) {
      const existing = parsePermit(existingPermit);
      if (
        existing.keyId !== key.id ||
        existing.metadata.operationId !== recovery.metadata.operationId ||
        !sameRestoreIdentity(
          existing.metadata.initialIdentity,
          recovery.metadata.initialIdentity,
        )
      )
        throw new Error(
          "Условия восстановления уже принадлежат другой операции.",
        );
    } else {
      await allowances.set(permitText);
      if ((await allowances.get()) !== permitText)
        throw new Error("Не удалось проверить условия восстановления.");
    }
    await storage.setItem(VAULT_STORAGE_KEY, raw);
    if ((await storage.getItem(VAULT_STORAGE_KEY)) !== raw)
      throw new Error("Не удалось проверить запись зашифрованных данных.");
    const committed = await readRecord(raw);
    if (
      !committed.recovery ||
      committed.recovery.currentText !== recovery.currentText
    )
      throw new Error("Не удалось подтвердить полный сохранённый снимок.");
    cachedKey = key;
    previousBytes = fingerprintText(recovery.currentText).utf8Bytes;
    await storage.removeItem(LEGACY_STORAGE_KEY);
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
    try {
      await allowances?.remove();
    } catch {
      /* A stale permit cannot authorize a v1 envelope. */
    }
  }
  return {
    inspect,
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
      const plain = writeRecoveryRecord(candidate, operationId);
      // An interrupted first write may have already installed its immutable permit.
      const pendingRaw = await allowances?.get();
      let key: Key;
      if (pendingRaw) {
        const pending = parsePermit(pendingRaw);
        if (
          pending.metadata.operationId !== operationId ||
          !sameRestoreIdentity(
            pending.metadata.initialIdentity,
            candidate.identity,
          )
        )
          throw new Error("Другая операция восстановления ещё не завершена.");
        const secret = await keys.get(pending.keyId);
        if (!secret) throw new Error("Ключ устройства недоступен.");
        key = { id: pending.keyId, secret };
      } else key = await keys.create();
      await writeRecovery(plain, key);
      return confirmImportedSnapshot(await inspect(), candidate, operationId);
    },
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
      const durable = await storage.getItem(VAULT_STORAGE_KEY);
      if (
        durable !== null &&
        (durable.length > 20_001_000 || envelope(durable).version === 2)
      ) {
        const current = await readRecord(durable);
        if (current.recovery) {
          const next = updateRecoveryRecord(
            current.recovery,
            state,
            localDate(),
          );
          if (next.unchanged) {
            cachedKey = current.key;
            previousBytes =
              current.recovery.candidate.identity.normalizedFingerprint
                .utf8Bytes;
            // Complete cleanup if the prior write committed before this failed.
            await storage.removeItem(LEGACY_STORAGE_KEY);
            return;
          }
          if (next.ordinary) await write(decodeBackup(next.raw), current.key);
          else await writeRecovery(next.raw, current.key);
          return;
        }
      }
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
      let previous: string | null = null;
      let allowance = 0;
      let alreadyStored = false;
      try {
        previous = await storage.getItem(VAULT_STORAGE_KEY);
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
