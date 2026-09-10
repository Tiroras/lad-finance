import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { decodeBackup, encodeBackup } from "./domain/backup";
import { localDate } from "./domain/finance";
import type { FinanceState } from "./domain/types";

export async function exportBackup(state: FinanceState) {
  const content = encodeBackup(state);
  const name = `lad-backup-${localDate()}.json`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Системное меню экспорта сейчас недоступно.");
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Сохранить резервную копию Лада",
    });
  } finally {
    if (file.exists) file.delete();
  }
}

export async function importBackup(): Promise<FinanceState | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > 5_000_000)
    throw new Error("Файл слишком большой. Максимальный размер — 5 МБ.");
  if (Platform.OS === "web") {
    const raw = asset.file
      ? await asset.file.text()
      : await (await fetch(asset.uri)).text();
    return decodeBackup(raw);
  }
  const file = new File(asset.uri);
  try {
    return decodeBackup(await file.text());
  } finally {
    if (file.exists) file.delete();
  }
}
