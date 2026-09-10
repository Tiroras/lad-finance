import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeBackup, encodeBackup } from "../domain/backup";
import { LEGACY_STORAGE_KEY } from "../security/vault";
import type { FinanceState } from "../domain/types";

// Browser preview has no Keychain/Keystore. Never claim native protection here.
export const encryptedStorage = false;
export const ledgerStorage = {
  async load() {
    const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? decodeBackup(raw) : null;
  },
  async save(state: FinanceState) {
    await AsyncStorage.setItem(LEGACY_STORAGE_KEY, encodeBackup(state));
  },
  async recover(state: FinanceState) {
    await AsyncStorage.setItem(LEGACY_STORAGE_KEY, encodeBackup(state));
  },
};
