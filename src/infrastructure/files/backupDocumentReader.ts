export interface BackupDocument {
  name: string;
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): void;
}

export function assertReadBounds(size: number, offset: number, length: number) {
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    offset > size ||
    length > size - offset
  )
    throw new Error("Файл копии обрезан или имеет неверный размер.");
}

export function assertBackupFileName(name: string) {
  if (!/\.(json|ladbackup|ladrescue)$/i.test(name))
    throw new Error("Выберите файл JSON, LADBACKUP или LADRESCUE.");
}
