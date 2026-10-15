import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import {
  assertProfileId,
  createDefaultProfiles,
  decodeProfileRegistry,
  encodeProfileRegistry,
  isFinanceProfile,
  validateProfiles,
  type FinanceProfile,
  type LedgerProfile,
} from "../../domain/profiles";
import { LEGACY_STORAGE_KEY, VAULT_STORAGE_KEY } from "./vault";

export type { FinanceProfile, LedgerProfile } from "../../domain/profiles";

const ACTIVE_PROFILE_KEY = "lad-active-profile-v1";
const PROFILES_KEY = "lad-profiles-v1";
const RECOVERY_KEY = "lad-profile-recovery-v1";

/** Raw metadata only. The recovery protocol never receives a ledger writer here. */
export const profileRecoveryStorage = {
  getAllKeys: () => AsyncStorage.getAllKeys(),
  readCatalog: () => AsyncStorage.getItem(PROFILES_KEY),
  writeCatalog: (raw: string | null) =>
    raw === null
      ? AsyncStorage.removeItem(PROFILES_KEY)
      : AsyncStorage.setItem(PROFILES_KEY, raw),
  readActive: () => AsyncStorage.getItem(ACTIVE_PROFILE_KEY),
  writeActive: (raw: string | null) =>
    raw === null
      ? AsyncStorage.removeItem(ACTIVE_PROFILE_KEY)
      : AsyncStorage.setItem(ACTIVE_PROFILE_KEY, raw),
  readJournal: () => AsyncStorage.getItem(RECOVERY_KEY),
  writeJournal: (raw: string) => AsyncStorage.setItem(RECOVERY_KEY, raw),
  removeJournal: () => AsyncStorage.removeItem(RECOVERY_KEY),
};

export function generateProfileId(): FinanceProfile {
  return `profile-${randomUUID()}`;
}

export function profileStorageKey(profile: FinanceProfile, key: string) {
  assertProfileId(profile);
  return `lad-profile-${profile}:${key}`;
}

export function createProfileStorage(
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<unknown>;
    removeItem(key: string): Promise<unknown>;
  },
  profile: FinanceProfile,
) {
  assertProfileId(profile);
  // Every ledger key, including vault cleanup keys, belongs to this profile.
  // The old shared ledger is neither read nor migrated or removed.
  return {
    getItem: (key: string) => storage.getItem(profileStorageKey(profile, key)),
    setItem: (key: string, value: string) =>
      storage.setItem(profileStorageKey(profile, key), value),
    removeItem: (key: string) =>
      storage.removeItem(profileStorageKey(profile, key)),
  };
}

export async function readProfiles(): Promise<LedgerProfile[]> {
  const raw = await AsyncStorage.getItem(PROFILES_KEY);
  try {
    if (raw === null) {
      const keys = await AsyncStorage.getAllKeys();
      if (
        keys.some((key) => {
          const match = /^lad-profile-(profile-[^:]+):(.+)$/.exec(key);
          return (
            match &&
            isFinanceProfile(match[1]) &&
            (match[2] === LEGACY_STORAGE_KEY || match[2] === VAULT_STORAGE_KEY)
          );
        })
      )
        throw new Error("Отсутствует список сохранённых профилей.");
      return createDefaultProfiles();
    }
    return decodeProfileRegistry(raw);
  } catch {
    throw new Error(
      "Не удалось прочитать список профилей. Данные сохранены на устройстве. Попробуйте открыть приложение заново.",
    );
  }
}

export async function hasStoredProfiles(): Promise<boolean> {
  const keys = await AsyncStorage.getAllKeys();
  // Presence matters here: damaged or empty records must never start a new ledger.
  // Reading and validating their contents belongs to the normal loading flow.
  return keys.some((key) => {
    if (key === PROFILES_KEY) return true;
    const match = /^lad-profile-([^:]+):(.+)$/.exec(key);
    return (
      match !== null &&
      isFinanceProfile(match[1]) &&
      (match[2] === LEGACY_STORAGE_KEY || match[2] === VAULT_STORAGE_KEY)
    );
  });
}

export async function writeProfiles(profiles: readonly LedgerProfile[]) {
  await AsyncStorage.setItem(PROFILES_KEY, encodeProfileRegistry(profiles));
}

export async function readActiveProfile(
  demoEnabled: boolean,
  profiles?: readonly LedgerProfile[],
): Promise<FinanceProfile> {
  const knownProfiles =
    profiles === undefined ? await readProfiles() : validateProfiles(profiles);
  const profile = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
  // An absent or invalid preference has no financial data to recover.
  if (profile === "demo") return demoEnabled ? "demo" : "personal";
  return isFinanceProfile(profile) &&
    knownProfiles.some((p) => p.id === profile)
    ? profile
    : "personal";
}

export function writeActiveProfile(profile: FinanceProfile) {
  assertProfileId(profile);
  return AsyncStorage.setItem(ACTIVE_PROFILE_KEY, profile);
}
