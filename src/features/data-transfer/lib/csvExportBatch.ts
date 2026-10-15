import {
  exportTransactionsCsvParts,
  type CsvExportOptions,
  type CsvExportParts,
} from "../../../domain/csvExport";
import { assertProfileId, type FinanceProfile } from "../../../domain/profiles";
import type { FinanceState } from "../../../domain/types";
import { fingerprintBackupParts } from "../../../infrastructure/files/backupFingerprint";
import {
  checkedCsvExportReceipt,
  type CsvExportReceipt,
  type CsvPartReceipt,
} from "../../../infrastructure/storage/csvExportReceipts";

export interface PreparedCsvBatch {
  readonly id: string;
  readonly profileId: FinanceProfile;
  readonly profileName: string;
  readonly accountName: string;
  readonly today: string;
  readonly options: Readonly<CsvExportOptions>;
  readonly totals: CsvExportParts["totals"];
  readonly parts: readonly (CsvExportParts["parts"][number] & {
    readonly name: string;
    readonly sha256: string;
  })[];
  readonly receipt: CsvExportReceipt;
}

export function prepareCsvExportBatch(
  input: {
    state: FinanceState;
    profileId: FinanceProfile;
    profileName: string;
    today: string;
    options: CsvExportOptions;
  },
  batchId: string,
  preparedAt: string,
): PreparedCsvBatch {
  assertProfileId(input.profileId);
  const result = exportTransactionsCsvParts(
    input.state,
    input.options,
    input.today,
  );
  if (!result.parts.length)
    throw new Error("В выбранном периоде нет операций для CSV.");
  const width = Math.max(3, String(result.parts.length).length);
  const parts = result.parts.map((part, index) =>
    Object.freeze({
      ...part,
      period: Object.freeze({ ...part.period }),
      name: `lad-${input.today}-${batchId}-${String(index + 1).padStart(width, "0")}-of-${String(result.parts.length).padStart(width, "0")}.csv`,
      sha256: fingerprintBackupParts([new TextEncoder().encode(part.content)])
        .sha256,
    }),
  );
  const receipt = checkedCsvExportReceipt({
    version: 1,
    batchId,
    parts: parts.map((part, index) => ({
      part: index + 1,
      fileName: part.name,
      sha256: part.sha256,
      byteLength: part.byteLength,
      preparedAt,
    })),
  });
  return Object.freeze({
    id: batchId,
    profileId: input.profileId,
    profileName: input.profileName,
    accountName: input.options.accountId
      ? input.state.accounts.find(
          (account) => account.id === input.options.accountId,
        )!.name
      : "Все счета",
    today: input.today,
    options: Object.freeze({ ...input.options }),
    totals: Object.freeze({
      ...result.totals,
      period: Object.freeze({ ...result.totals.period }),
    }),
    parts: Object.freeze(parts),
    receipt: Object.freeze({
      ...receipt,
      parts: Object.freeze(receipt.parts.map((part) => Object.freeze(part))),
    }),
  });
}

export function verifyCsvExportFile(
  receipt: CsvPartReceipt,
  bytes: Uint8Array,
  preparedContent?: string,
) {
  const fingerprint = fingerprintBackupParts([bytes]);
  if (
    fingerprint.sha256 !== receipt.sha256 ||
    fingerprint.byteLength !== receipt.byteLength
  )
    throw new Error("Это другой файл. Выберите точный файл этой CSV-части.");
  if (preparedContent !== undefined) {
    const expected = new TextEncoder().encode(preparedContent);
    if (
      expected.length !== bytes.length ||
      expected.some((byte, index) => byte !== bytes[index])
    )
      throw new Error("Файл отличается от подготовленной CSV-части.");
  }
  return fingerprint;
}
