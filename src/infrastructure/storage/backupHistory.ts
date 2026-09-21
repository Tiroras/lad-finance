import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "lad-last-backup-prepared";

export function readLastBackupDate() {
  return AsyncStorage.getItem(HISTORY_KEY);
}

export function writeLastBackupDate(date: string) {
  return AsyncStorage.setItem(HISTORY_KEY, date);
}
