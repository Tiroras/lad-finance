import * as SecureStore from "expo-secure-store";
import { isFinanceProfile } from "../../domain/profiles";
import { clearAppLock } from "../device/deviceSecurity";
import { clearPaymentNotifications } from "../notifications/notifications";
import { VAULT_STORAGE_KEY } from "./vault";

export async function resetDeviceData(
  entries: readonly (readonly [string, string | null])[],
) {
  await clearPaymentNotifications();
  for (const [storageKey, raw] of entries) {
    const match = /^lad-profile-([^:]+):(.+)$/.exec(storageKey);
    const profile = match?.[1];
    if (
      storageKey !== VAULT_STORAGE_KEY &&
      !(isFinanceProfile(profile) && match?.[2] === VAULT_STORAGE_KEY)
    )
      continue;
    let keyId: unknown;
    try {
      keyId = raw === null ? undefined : JSON.parse(raw)?.keyId;
    } catch {
      // An unreadable envelope must still be removable for a fresh start.
      continue;
    }
    if (typeof keyId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(keyId))
      continue;
    await SecureStore.deleteItemAsync(
      profile ? `lad-${profile}-vault-key-${keyId}` : `lad-vault-key-${keyId}`,
      {
        keychainService: profile
          ? `app.lad.finance.vault.${profile}`
          : "app.lad.finance.vault",
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
  }
  await clearAppLock();
}
