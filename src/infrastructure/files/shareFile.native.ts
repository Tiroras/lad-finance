import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function shareFile(
  content: string,
  name: string,
  mimeType: string,
) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Системное меню экспорта сейчас недоступно.");
  const file = new File(Paths.cache, name);
  try {
    file.create({ overwrite: true });
    file.write(content);
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
    if (file.exists) file.delete();
  }
}
