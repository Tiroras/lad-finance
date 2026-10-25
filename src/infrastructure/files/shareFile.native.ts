import { Directory, File, FileMode, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import * as Sharing from "expo-sharing";

export async function shareFile(
  content: string | readonly Uint8Array[],
  name: string,
  mimeType: string,
) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Системное меню экспорта сейчас недоступно.");
  const directory = new Directory(Paths.cache, `lad-export-${randomUUID()}`);
  const file = new File(directory, name);
  try {
    directory.create();
    file.create();
    if (typeof content === "string") await file.write(content);
    else {
      const handle = file.open(FileMode.WriteOnly);
      try {
        for (const part of content) await handle.writeBytes(part);
      } finally {
        handle.close();
      }
    }
    await Sharing.shareAsync(file.uri, {
      mimeType,
      UTI:
        mimeType === "text/csv"
          ? "public.comma-separated-values-text"
          : mimeType === "application/json"
            ? "public.json"
            : "public.data",
      dialogTitle: "Сохранить файл Лада",
    });
  } finally {
    if (directory.exists) directory.delete();
  }
}
