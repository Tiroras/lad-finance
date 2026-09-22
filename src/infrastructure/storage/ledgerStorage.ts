import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPlainLedgerStorage } from "./plainLedgerStorage";

// Browser preview has no Keychain/Keystore. Never claim native protection here.
export const encryptedStorage = false;
export const ledgerStorage = createPlainLedgerStorage(AsyncStorage);
