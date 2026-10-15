import * as SecureStore from "expo-secure-store";
import { isFinanceProfile, type FinanceProfile } from "../../domain/profiles";
import { clearAppLock } from "../device/deviceSecurity";
import { clearPaymentNotifications } from "../notifications/notifications";
import { VAULT_STORAGE_KEY } from "./vault";
import {
  listCiphertextKeysForReset,
  removeCiphertextFilesForReset,
} from "./ciphertextFiles.native";
import { draftKeyName, draftKeyService } from "./draftStore";

export async function resetDeviceData(
  entries: readonly (readonly [string, string | null])[],
) {
  await clearPaymentNotifications();
  const profiles = new Set<FinanceProfile>(["personal", "demo"]);
  const keyIds = new Map<string, { profile?: FinanceProfile; keyId: string }>();
  const addKey = (profile: FinanceProfile | undefined, keyId: unknown) => {
    if (typeof keyId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(keyId))
      keyIds.set(`${profile ?? "shared"}:${keyId}`, { profile, keyId });
  };
  for (const item of listCiphertextKeysForReset()) {
    profiles.add(item.profile);
    addKey(item.profile, item.keyId);
  }
  for (const [storageKey, raw] of entries) {
    const match = /^lad-profile-([^:]+):(.+)$/.exec(storageKey);
    const profile = match?.[1];
    if (isFinanceProfile(profile)) profiles.add(profile);
    if (
      storageKey === "lad-profiles-v1" ||
      storageKey === "lad-profile-recovery-v1"
    ) {
      try {
        const metadata = raw === null ? null : JSON.parse(raw);
        if (isFinanceProfile(metadata?.targetId))
          profiles.add(metadata.targetId);
        if (Array.isArray(metadata?.profiles))
          for (const item of metadata.profiles)
            if (isFinanceProfile(item?.id)) profiles.add(item.id);
      } catch {
        /* Fresh also removes damaged metadata. */
      }
    }
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
    addKey(isFinanceProfile(profile) ? profile : undefined, keyId);
  }
  // A failed first import can leave only a journal and a SecureStore permit.
  for (const profile of profiles) {
    const options = {
      keychainService: `app.lad.finance.vault.${profile}`,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    };
    const permit = await SecureStore.getItemAsync(
      `lad-${profile}-rescue-allowance`,
      options,
    );
    try {
      if (permit !== null && permit.length <= 16384)
        addKey(profile, JSON.parse(permit)?.keyId);
    } catch {
      /* A malformed permit must not prevent an explicit Fresh reset. */
    }
  }
  for (const { profile, keyId } of keyIds.values()) {
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
  for (const profile of profiles) {
    await SecureStore.deleteItemAsync(`lad-${profile}-rescue-allowance`, {
      keychainService: `app.lad.finance.vault.${profile}`,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.deleteItemAsync(draftKeyName(profile), {
      keychainService: draftKeyService(profile),
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  removeCiphertextFilesForReset();
  await clearAppLock();
}
