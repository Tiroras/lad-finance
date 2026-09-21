export const deviceSecurityAvailable = false;
export async function readAppLock() {
  return false;
}
export async function writeAppLock(_enabled: boolean) {
  throw new Error("Блокировка доступна в приложении для iOS и Android.");
}
export async function authenticateDevice() {
  return false;
}
export async function protectScreen(_enabled: boolean) {}
