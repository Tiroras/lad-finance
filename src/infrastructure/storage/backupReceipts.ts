import AsyncStorage from "@react-native-async-storage/async-storage";
import { profileStorageKey, type FinanceProfile } from "./profileStorage";

export interface BackupReceipt {
  version: 1;
  exportId: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  encrypted: boolean;
  sourceKind: "current" | "last-readable-saved";
  preparedAt: string;
  userConfirmedAt?: string;
  readVerifiedAt?: string;
}

type ReceiptStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
const KEY = "lad-backup-receipt-v1";
const queues = new WeakMap<ReceiptStorage, Map<string, Promise<unknown>>>();
const validInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

function checkedReceipt(value: unknown): BackupReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Не удалось прочитать отметку резервной копии.");
  const entry = value as Partial<BackupReceipt>;
  if (
    entry.version !== 1 ||
    typeof entry.exportId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(entry.exportId) ||
    typeof entry.fileName !== "string" ||
    !entry.fileName ||
    entry.fileName.length > 180 ||
    /[\\/\u0000-\u001f\u007f-\u009f]/.test(entry.fileName) ||
    typeof entry.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(entry.sha256) ||
    !Number.isSafeInteger(entry.byteLength) ||
    entry.byteLength! <= 0 ||
    typeof entry.encrypted !== "boolean" ||
    !["current", "last-readable-saved"].includes(entry.sourceKind ?? "") ||
    !validInstant(entry.preparedAt) ||
    (entry.userConfirmedAt !== undefined &&
      !validInstant(entry.userConfirmedAt)) ||
    (entry.readVerifiedAt !== undefined && !validInstant(entry.readVerifiedAt))
  )
    throw new Error(
      "Отметка резервной копии повреждена. Создайте новую копию.",
    );
  return {
    version: 1,
    exportId: entry.exportId,
    fileName: entry.fileName,
    sha256: entry.sha256,
    byteLength: entry.byteLength!,
    encrypted: entry.encrypted,
    sourceKind: entry.sourceKind!,
    preparedAt: entry.preparedAt,
    ...(entry.userConfirmedAt
      ? { userConfirmedAt: entry.userConfirmedAt }
      : {}),
    ...(entry.readVerifiedAt ? { readVerifiedAt: entry.readVerifiedAt } : {}),
  };
}

// Serializes metadata updates for one profile in this process. It does not
// claim a storage transaction or modify any financial snapshot.
export function createBackupReceiptStore(
  storage: ReceiptStorage,
  profile: FinanceProfile,
) {
  const key = profileStorageKey(profile, KEY);
  let queue = queues.get(storage);
  if (!queue) {
    queue = new Map();
    queues.set(storage, queue);
  }
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = (queue!.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(operation);
    queue!.set(key, next);
    void next
      .finally(() => {
        if (queue!.get(key) === next) queue!.delete(key);
      })
      .catch(() => undefined);
    return next;
  };
  const read = async (): Promise<BackupReceipt | null> => {
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    if (raw.length > 4096)
      throw new Error("Отметка резервной копии повреждена.");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Отметка резервной копии повреждена.");
    }
    return checkedReceipt(value);
  };
  const write = async (value: BackupReceipt) => {
    const receipt = checkedReceipt(value);
    const raw = JSON.stringify(receipt);
    await storage.setItem(key, raw);
    if ((await storage.getItem(key)) !== raw)
      throw new Error("Не удалось сохранить отметку резервной копии.");
    return receipt;
  };
  return {
    read,
    prepared(
      receipt: Omit<
        BackupReceipt,
        "version" | "userConfirmedAt" | "readVerifiedAt"
      >,
    ) {
      return exclusive(() =>
        write({
          ...receipt,
          version: 1,
          userConfirmedAt: undefined,
          readVerifiedAt: undefined,
        }),
      );
    },
    confirmSaved(exportId: string, at = new Date().toISOString()) {
      return exclusive(async () => {
        const current = await read();
        if (!current || current.exportId !== exportId) return null;
        return write({ ...current, userConfirmedAt: at });
      });
    },
    verifyRead(
      expectedExportId: string,
      file: { sha256: string; byteLength: number },
      at = new Date().toISOString(),
    ) {
      return exclusive(async () => {
        const current = await read();
        if (
          !current ||
          current.exportId !== expectedExportId ||
          current.sha256 !== file.sha256 ||
          current.byteLength !== file.byteLength
        )
          return null;
        return write({ ...current, readVerifiedAt: at });
      });
    },
  };
}

export const getBackupReceiptStore = (profile: FinanceProfile) =>
  createBackupReceiptStore(AsyncStorage, profile);
