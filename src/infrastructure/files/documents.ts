import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

export async function pickDocument(extensions: string[], limit: number) {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const cached = Platform.OS === "web" ? null : new File(asset.uri);
  try {
    if (
      !extensions.some((extension) =>
        asset.name.toLowerCase().endsWith(`.${extension}`),
      )
    )
      throw new Error(
        `Выберите файл ${extensions.join(" или ").toUpperCase()}.`,
      );
    if ((asset.size ?? cached?.size ?? 0) > limit)
      throw new Error(`Файл должен быть не больше ${limit / 1_000_000} МБ.`);
    const bytes = cached
      ? await cached.bytes()
      : new Uint8Array(
          await (asset.file
            ? asset.file.arrayBuffer()
            : (await fetch(asset.uri)).arrayBuffer()),
        );
    if (bytes.length > limit)
      throw new Error(`Файл должен быть не больше ${limit / 1_000_000} МБ.`);
    return { name: asset.name, bytes };
  } finally {
    // The picker creates this cache copy; never keep a plaintext statement.
    if (cached?.exists) cached.delete();
  }
}
