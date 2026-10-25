import * as DocumentPicker from "expo-document-picker";
import { File, FileMode, type FileHandle } from "expo-file-system";
import {
  assertBackupFileName,
  assertReadBounds,
  type BackupDocument,
} from "./backupDocumentReader";

export async function pickBackupDocument(): Promise<BackupDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  let handle: FileHandle | undefined;
  let closed = false;
  const close = () => {
    closed = true;
    try {
      handle?.close();
    } finally {
      handle = undefined;
      // Only the picker-owned cache copy is removed, never the selected source.
      if (file.exists) file.delete();
    }
  };
  try {
    assertBackupFileName(asset.name);
    const size = file.size;
    assertReadBounds(size, 0, 0);
    handle = file.open(FileMode.ReadOnly);
    if (handle.size !== size)
      throw new Error("Размер файла изменился. Выберите копию ещё раз.");
    return {
      name: asset.name,
      size,
      async read(offset, length) {
        if (closed || !handle) throw new Error("Выберите файл копии ещё раз.");
        assertReadBounds(size, offset, length);
        if (handle.size !== size)
          throw new Error("Размер файла изменился. Выберите копию ещё раз.");
        handle.offset = offset;
        const bytes = await handle.readBytes(length);
        if (bytes.length !== length)
          throw new Error("Не удалось полностью прочитать файл копии.");
        return bytes;
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
