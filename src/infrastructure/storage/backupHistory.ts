import AsyncStorage from "@react-native-async-storage/async-storage";
import { profileStorageKey, type FinanceProfile } from "./profileStorage";

const HISTORY_KEY = "lad-last-backup-prepared";

export function readLastBackupDate(profile: FinanceProfile) {
  return AsyncStorage.getItem(profileStorageKey(profile, HISTORY_KEY));
}

export function writeLastBackupDate(profile: FinanceProfile, date: string) {
  return AsyncStorage.setItem(profileStorageKey(profile, HISTORY_KEY), date);
}
