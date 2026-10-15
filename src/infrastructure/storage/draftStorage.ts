import AsyncStorage from "@react-native-async-storage/async-storage";
import { assertProfileId, type FinanceProfile } from "../../domain/profiles";
import { createDraftStore, type DraftStorage } from "./draftStore";

export const encryptedDraftStorage = false;
const stores = new Map<FinanceProfile, DraftStorage>();
export function getDraftStorage(profile: FinanceProfile): DraftStorage {
  assertProfileId(profile);
  let store = stores.get(profile);
  if (!store) {
    store = createDraftStore({
      profile,
      storage: AsyncStorage,
      random: (length) =>
        globalThis.crypto.getRandomValues(new Uint8Array(length)),
    });
    stores.set(profile, store);
  }
  return store;
}
