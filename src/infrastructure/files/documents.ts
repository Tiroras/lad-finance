import * as DocumentPicker from "expo-document-picker";
import { readBoundedDocument } from "./documentReader";

export async function pickDocument(extensions: string[], limit: number) {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
    const file = asset.file;
    if (!file)
      throw new Error(
        "Не удалось открыть выбранный файл. Выберите его ещё раз.",
      );
    return await readBoundedDocument(
      {
        name: asset.name,
        size: file.size,
        read: async () => new Uint8Array(await file.arrayBuffer()),
      },
      extensions,
      limit,
    );
  } finally {
    if (asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
  }
}
