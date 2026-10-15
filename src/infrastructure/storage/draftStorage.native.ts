import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { assertProfileId, type FinanceProfile } from "../../domain/profiles";
import { backupCrypto } from "../crypto/backupCrypto";
import {
  createDraftStore,
  draftKeyName,
  draftKeyService,
  type DraftStorage,
} from "./draftStore";

export const encryptedDraftStorage = true;
const options = (profile: FinanceProfile): SecureStore.SecureStoreOptions => ({
  keychainService: draftKeyService(profile),
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
const stores = new Map<FinanceProfile, DraftStorage>();
export function getDraftStorage(profile: FinanceProfile): DraftStorage {
  assertProfileId(profile);
  let store = stores.get(profile);
  if (!store) {
    store = createDraftStore({
      profile,
      storage: AsyncStorage,
      random: backupCrypto.random,
      encryption: {
        cipher: backupCrypto,
        keys: {
          get: (id) => SecureStore.getItemAsync(draftKeyName(id), options(id)),
          set: (id, raw) =>
            SecureStore.setItemAsync(draftKeyName(id), raw, options(id)),
          remove: (id) =>
            SecureStore.deleteItemAsync(draftKeyName(id), options(id)),
        },
      },
    });
    stores.set(profile, store);
  }
  return store;
}
