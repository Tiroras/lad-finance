import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";

export const deviceSecurityAvailable = true;
const LOCK_KEY = "lad-app-lock-v1";
const options: SecureStore.SecureStoreOptions = {
  keychainService: "app.lad.finance.lock",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export async function readAppLock() {
  const value = await SecureStore.getItemAsync(LOCK_KEY, options);
  if (value !== null && value !== "on" && value !== "off")
    throw new Error("Не удалось прочитать настройку защиты.");
  return value === "on";
}
export async function writeAppLock(enabled: boolean) {
  await SecureStore.setItemAsync(LOCK_KEY, enabled ? "on" : "off", options);
}
export async function authenticateDevice() {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE)
    throw new Error(
      "Сначала настройте код блокировки, Face ID или отпечаток в настройках телефона.",
    );
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Открыть Лад",
    cancelLabel: "Отмена",
    fallbackLabel: "Код устройства",
    disableDeviceFallback: false,
    biometricsSecurityLevel: "strong",
  });
  if (
    !result.success &&
    ["not_available", "not_enrolled", "passcode_not_set"].includes(result.error)
  )
    throw new Error(
      "Системная проверка недоступна. Проверьте код и биометрию в настройках телефона.",
    );
  return result.success;
}
export async function protectScreen(enabled: boolean) {
  if (Platform.OS === "ios") {
    if (enabled) await ScreenCapture.enableAppSwitcherProtectionAsync(1);
    else await ScreenCapture.disableAppSwitcherProtectionAsync();
  } else {
    if (enabled) await ScreenCapture.preventScreenCaptureAsync("lad-lock");
    else await ScreenCapture.allowScreenCaptureAsync("lad-lock");
  }
}
