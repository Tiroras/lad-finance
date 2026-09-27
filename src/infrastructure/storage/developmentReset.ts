import AsyncStorage from "@react-native-async-storage/async-storage";
import { FRESH_START_ENABLED } from "../../shared/lib/buildOptions";
import { resetDeviceData } from "./resetDeviceData";

let pending: Promise<void> | undefined;

export function resetDevelopmentData(): Promise<void> {
  if (!FRESH_START_ENABLED) return Promise.resolve();
  // Reset once per JS launch, before mounting any providers. Re-renders,
  // Strict Mode and ordinary Fast Refresh must not erase the new session.
  pending ??= clearData().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

async function clearData() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith("lad-"),
  );
  const entries = await AsyncStorage.multiGet(keys);
  // Read key IDs before removing encrypted envelopes. On failure the app
  // stays at startup and offers a retry, without loading a partial ledger.
  await resetDeviceData(entries);
  await AsyncStorage.multiRemove(keys);
}
