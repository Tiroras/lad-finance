import AsyncStorage from "@react-native-async-storage/async-storage";
import { assertProfileId } from "../../domain/profiles";
import { createPlainLedgerStorage } from "./plainLedgerStorage";
import { createProfileStorage, type FinanceProfile } from "./profileStorage";

// Browser preview has no Keychain/Keystore. Never claim native protection here.
export const encryptedStorage = false;
const ledgers = new Map<
  FinanceProfile,
  ReturnType<typeof createPlainLedgerStorage>
>();

export function getLedgerStorage(profile: FinanceProfile) {
  assertProfileId(profile);
  let ledger = ledgers.get(profile);
  if (!ledger) {
    ledger = createPlainLedgerStorage(
      createProfileStorage(AsyncStorage, profile),
    );
    ledgers.set(profile, ledger);
  }
  return ledger;
}
