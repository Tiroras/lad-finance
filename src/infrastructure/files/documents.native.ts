import * as DocumentPicker from "expo-document-picker";
import { File, FileMode, type FileHandle } from "expo-file-system";
import { readBoundedDocument } from "./documentReader";

export async function pickDocument(extensions: string[], limit: number) {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    file = new File(asset.uri);
  let handle: FileHandle | undefined;
  try {
    const size = file.size;
    return await readBoundedDocument(
      {
        name: asset.name,
        size,
        async read() {
          handle = file.open(FileMode.ReadOnly);
          if (handle.size !== size)
            throw new Error("Размер файла изменился. Выберите его ещё раз.");
          const bytes = handle.readBytes(size);
          if (handle.size !== size)
            throw new Error("Размер файла изменился. Выберите его ещё раз.");
          return bytes;
        },
      },
      extensions,
      limit,
    );
  } finally {
    try {
      handle?.close();
    } finally {
      // Only the picker-owned cache copy, never the selected external file.
      if (file.exists) file.delete();
    }
  }
}
