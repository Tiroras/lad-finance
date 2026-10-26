import type { FinanceProfile } from "../../domain/profiles";

// Web has no SecureStore, device lock or scheduled local notifications.
export async function resetDeviceData(
  _entries: readonly (readonly [string, string | null])[],
  _profile?: FinanceProfile,
) {}
