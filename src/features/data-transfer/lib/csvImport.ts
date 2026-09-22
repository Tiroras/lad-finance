import { parseCsv, type CsvTable } from "../../../domain/csv";
import { decodeCsvBytes, type CsvEncoding } from "../../../domain/csvEncoding";
import type { CsvSourceProfile } from "../../../domain/automation";

export interface CsvFile {
  name: string;
  bytes: Uint8Array;
}
export interface CsvSourceSettings {
  encoding: CsvEncoding;
  separator: CsvSourceProfile["separator"];
  headerRow: string;
}
export interface CsvSource extends CsvSourceSettings {
  file: CsvFile | null;
  table: CsvTable | null;
  error: string;
}

export function prepareCsvSource(
  file: CsvFile | null,
  settings: CsvSourceSettings,
): CsvSource {
  const source = {
    encoding: settings.encoding,
    separator: settings.separator,
    headerRow: settings.headerRow,
    file,
    table: null,
    error: "",
  };
  if (!file) return source;
  try {
    const { encoding, separator, headerRow } = settings;
    if (
      !/^\d{1,2}$/.test(headerRow) ||
      Number(headerRow) < 1 ||
      Number(headerRow) > 30
    )
      throw new Error("Укажите строку заголовков от 1 до 30.");
    const raw = decodeCsvBytes(file.bytes, encoding);
    return {
      ...source,
      table: parseCsv(
        raw
          .split(/\r?\n/)
          .slice(Number(headerRow) - 1)
          .join("\n"),
        separator === "auto" ? undefined : separator,
      ),
    };
  } catch (failure) {
    return {
      ...source,
      error:
        failure instanceof Error
          ? failure.message
          : "Не удалось прочитать CSV.",
    };
  }
}
