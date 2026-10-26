import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  randomUUID,
} from "expo-crypto";
import { assertProfileId } from "../../domain/profiles";
import { createVault } from "./vault";
import { createProfileStorage, type FinanceProfile } from "./profileStorage";
import { createNativeEncryptedFileStorage } from "./ciphertextFiles.native";

export const encryptedStorage = true;

function createProfileVault(profile: FinanceProfile) {
  const options: SecureStore.SecureStoreOptions = {
    keychainService: `app.lad.finance.vault.${profile}`,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  const keyName = (id: string) => `lad-${profile}-vault-key-${id}`;
  return createVault({
    profileId: profile,
    allowances: {
      get: () =>
        SecureStore.getItemAsync(`lad-${profile}-rescue-allowance`, options),
      set: (value) =>
        SecureStore.setItemAsync(
          `lad-${profile}-rescue-allowance`,
          value,
          options,
        ),
      remove: () =>
        SecureStore.deleteItemAsync(`lad-${profile}-rescue-allowance`, options),
    },
    storage: createNativeEncryptedFileStorage(
      profile,
      createProfileStorage(AsyncStorage, profile),
    ),
    keys: {
      get: (id) => SecureStore.getItemAsync(keyName(id), options),
      async create() {
        const id = randomUUID();
        const key = await AESEncryptionKey.generate(AESKeySize.AES256);
        const secret = await key.encoded("hex");
        await SecureStore.setItemAsync(keyName(id), secret, options);
        return { id, secret };
      },
      remove: (id) => SecureStore.deleteItemAsync(keyName(id), options),
    },
    cipher: {
      async seal(plain, secret, context) {
        const key = await AESEncryptionKey.import(secret, "hex");
        const sealed = await aesEncryptAsync(
          new TextEncoder().encode(plain),
          key,
          { additionalData: new TextEncoder().encode(context) },
        );
        return sealed.combined("base64");
      },
      async open(sealed, secret, context) {
        const key = await AESEncryptionKey.import(secret, "hex");
        // SDK 57 Android requires bytes here despite the JS API accepting base64.
        const sealedBytes = Uint8Array.from(atob(sealed), (byte) =>
          byte.charCodeAt(0),
        );
        const bytes = await aesDecryptAsync(
          AESSealedData.fromCombined(sealedBytes),
          key,
          { additionalData: new TextEncoder().encode(context) },
        );
        return new TextDecoder().decode(bytes);
      },
    },
  });
}

const ledgers = new Map<
  FinanceProfile,
  ReturnType<typeof createProfileVault>
>();

/** Forget cached vault keys after the writers have stopped and before reopening. */
export const clearLedgerStorageCache = () => ledgers.clear();

export function getLedgerStorage(profile: FinanceProfile) {
  assertProfileId(profile);
  let ledger = ledgers.get(profile);
  if (!ledger) {
    ledger = createProfileVault(profile);
    ledgers.set(profile, ledger);
  }
  return ledger;
}
