import { assertProfileId, type FinanceProfile } from "../../domain/profiles";

export interface CsvPartReceipt {
  part: number;
  fileName: string;
  sha256: string;
  byteLength: number;
  preparedAt: string;
  transfer?: { status: "unknown" | "failed"; at: string };
  userConfirmedAt?: string;
  readVerifiedAt?: string;
  notConfirmedAt?: string;
}
export interface CsvExportReceipt {
  version: 1;
  batchId: string;
  parts: readonly CsvPartReceipt[];
}
export type CsvReceiptAction =
  | { type: "transfer"; status: "unknown" | "failed" }
  | { type: "user-confirmed" }
  | { type: "not-confirmed" }
  | { type: "read-verified"; sha256: string; byteLength: number };
interface ReceiptStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
const instant = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const invalid = () =>
  new Error("Отметки CSV-набора повреждены. Подготовьте новый набор.");
export function checkedCsvExportReceipt(value: unknown): CsvExportReceipt {
  if (!value || typeof value !== "object") throw invalid();
  const receipt = value as Partial<CsvExportReceipt>;
  if (
    receipt.version !== 1 ||
    typeof receipt.batchId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(receipt.batchId) ||
    !Array.isArray(receipt.parts) ||
    !receipt.parts.length ||
    receipt.parts.length > 20000
  )
    throw invalid();
  const parts = receipt.parts.map((part: CsvPartReceipt, index) => {
    if (
      !part ||
      part.part !== index + 1 ||
      typeof part.fileName !== "string" ||
      !part.fileName.endsWith(".csv") ||
      part.fileName.length > 180 ||
      /[\\/\u0000-\u001f\u007f-\u009f]/.test(part.fileName) ||
      typeof part.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(part.sha256) ||
      !Number.isSafeInteger(part.byteLength) ||
      part.byteLength < 1 ||
      part.byteLength > 2_000_000 ||
      !instant(part.preparedAt) ||
      (part.userConfirmedAt !== undefined && !instant(part.userConfirmedAt)) ||
      (part.readVerifiedAt !== undefined && !instant(part.readVerifiedAt)) ||
      (part.notConfirmedAt !== undefined && !instant(part.notConfirmedAt)) ||
      (part.transfer !== undefined &&
        (!part.transfer ||
          !["unknown", "failed"].includes(part.transfer.status) ||
          !instant(part.transfer.at)))
    )
      throw invalid();
    return {
      part: part.part,
      fileName: part.fileName,
      sha256: part.sha256,
      byteLength: part.byteLength,
      preparedAt: part.preparedAt,
      ...(part.transfer
        ? { transfer: { status: part.transfer.status, at: part.transfer.at } }
        : {}),
      ...(part.userConfirmedAt
        ? { userConfirmedAt: part.userConfirmedAt }
        : {}),
      ...(part.readVerifiedAt ? { readVerifiedAt: part.readVerifiedAt } : {}),
      ...(part.notConfirmedAt ? { notConfirmedAt: part.notConfirmedAt } : {}),
    };
  });
  if (new Set(parts.map((part) => part.fileName)).size !== parts.length)
    throw invalid();
  return { version: 1, batchId: receipt.batchId, parts };
}

export function updateCsvExportReceipt(
  receipt: CsvExportReceipt,
  part: number,
  action: CsvReceiptAction,
  at = new Date().toISOString(),
): CsvExportReceipt {
  const checked = checkedCsvExportReceipt(receipt);
  if (!instant(at) || !checked.parts.some((entry) => entry.part === part))
    throw invalid();
  return {
    ...checked,
    parts: checked.parts.map((entry) => {
      if (entry.part !== part) return entry;
      if (action.type === "read-verified") {
        if (
          entry.sha256 !== action.sha256 ||
          entry.byteLength !== action.byteLength
        )
          throw new Error(
            "Это другой файл. Выберите точный файл этой CSV-части.",
          );
        return { ...entry, readVerifiedAt: at };
      }
      if (action.type === "transfer")
        return { ...entry, transfer: { status: action.status, at } };
      if (action.type === "user-confirmed")
        return { ...entry, userConfirmedAt: at, notConfirmedAt: undefined };
      return { ...entry, userConfirmedAt: undefined, notConfirmedAt: at };
    }),
  };
}

export function csvReceiptTotals(receipt: CsvExportReceipt) {
  return {
    total: receipt.parts.length,
    userConfirmed: receipt.parts.filter((part) => part.userConfirmedAt).length,
    readVerified: receipt.parts.filter((part) => part.readVerifiedAt).length,
  };
}

const queues = new WeakMap<ReceiptStorage, Map<string, Promise<unknown>>>();
/** Metadata only; never includes CSV content, account names or filters. */
export function createCsvExportReceiptStore(
  storage: ReceiptStorage,
  profile: FinanceProfile,
) {
  assertProfileId(profile);
  const key = `lad-profile-${profile}:lad-csv-export-receipt-v1`;
  let queue = queues.get(storage);
  if (!queue) {
    queue = new Map();
    queues.set(storage, queue);
  }
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const next = (queue!.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(task);
    queue!.set(key, next);
    void next
      .finally(() => {
        if (queue!.get(key) === next) queue!.delete(key);
      })
      .catch(() => {});
    return next;
  };
  const read = async () => {
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    if (raw.length > 1_000_000) throw invalid();
    try {
      return checkedCsvExportReceipt(JSON.parse(raw));
    } catch {
      throw invalid();
    }
  };
  const write = async (value: CsvExportReceipt) => {
    const checked = checkedCsvExportReceipt(value),
      raw = JSON.stringify(checked);
    if (raw.length > 1_000_000) throw invalid();
    await storage.setItem(key, raw);
    if ((await storage.getItem(key)) !== raw)
      throw new Error("Не удалось подтвердить запись отметок CSV.");
    return checked;
  };
  return {
    read,
    prepared: (receipt: CsvExportReceipt) =>
      exclusive(() =>
        write({
          ...receipt,
          parts: receipt.parts.map((part) => ({
            part: part.part,
            fileName: part.fileName,
            sha256: part.sha256,
            byteLength: part.byteLength,
            preparedAt: part.preparedAt,
          })),
        }),
      ),
    update: (
      batchId: string,
      part: number,
      action: CsvReceiptAction,
      at = new Date().toISOString(),
    ) =>
      exclusive(async () => {
        const receipt = await read();
        if (!receipt || receipt.batchId !== batchId)
          throw new Error(
            "Последний CSV-набор изменился. Подготовьте новый набор.",
          );
        return write(updateCsvExportReceipt(receipt, part, action, at));
      }),
  };
}
