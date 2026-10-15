import * as DocumentPicker from "expo-document-picker";
import {
  assertBackupFileName,
  assertReadBounds,
  type BackupDocument,
} from "./backupDocumentReader";

export async function pickBackupDocument(): Promise<BackupDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  let closed = false;
  const close = () => {
    closed = true;
    if (asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
  };
  try {
    assertBackupFileName(asset.name);
    // SDK 57's web picker provides File with base64:false. Never fetch an
    // unbounded URL as a fallback before a rescue header has been checked.
    const file = asset.file;
    if (!file)
      throw new Error(
        "Не удалось открыть выбранный файл. Выберите его ещё раз.",
      );
    assertReadBounds(file.size, 0, 0);
    return {
      name: asset.name,
      size: file.size,
      async read(offset, length) {
        if (closed) throw new Error("Выберите файл копии ещё раз.");
        assertReadBounds(file.size, offset, length);
        const bytes = new Uint8Array(
          await file.slice(offset, offset + length).arrayBuffer(),
        );
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
