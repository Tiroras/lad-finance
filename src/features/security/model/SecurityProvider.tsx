import { SecurityContext } from "./SecurityContext";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  authenticateDevice,
  deviceSecurityAvailable,
  protectScreen,
  readAppLock,
  writeAppLock,
} from "../../../infrastructure/device/deviceSecurity";
import { LockScreen } from "../components/LockScreen";

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [opened, setOpened] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const enabledRef = useRef(false),
    authenticating = useRef(false),
    backgroundDuringAuth = useRef(false);
  const operation = useRef(false);
  const initialize = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const value = await readAppLock();
      if (value) await protectScreen(true);
      enabledRef.current = value;
      setEnabled(value);
      setLocked(value);
      setOpened(!value);
      setInitialized(true);
    } catch {
      setError(
        "Не удалось прочитать защиту устройства. Данные остаются закрыты. Разблокируйте телефон и повторите попытку.",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "background" && authenticating.current)
        backgroundDuringAuth.current = true;
      if (enabledRef.current && status !== "active" && !authenticating.current)
        setLocked(true);
    });
    return () => subscription.remove();
  }, []);
  const authenticate = async () => {
    authenticating.current = true;
    backgroundDuringAuth.current = false;
    try {
      return (await authenticateDevice()) && !backgroundDuringAuth.current;
    } finally {
      authenticating.current = false;
    }
  };
  const unlock = async () => {
    if (!initialized) {
      await initialize();
      return;
    }
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      if (await authenticate()) {
        setLocked(false);
        setOpened(true);
      } else
        setError(
          "Вход не подтверждён. Повторите проверку, когда будете готовы.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось проверить доступ.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const setProtection = async (value: boolean) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await authenticate())) {
        setError("Изменение защиты не подтверждено.");
        return;
      }
      if (value) await protectScreen(true);
      await writeAppLock(value);
      enabledRef.current = value;
      setEnabled(value);
      setLocked(false);
      setOpened(true);
      if (!value) await protectScreen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить защиту.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return (
    <SecurityContext.Provider
      value={{
        supported: deviceSecurityAvailable,
        enabled,
        locked,
        busy,
        error,
        unlock,
        setEnabled: setProtection,
        lock: () => {
          if (enabledRef.current) setLocked(true);
        },
      }}
    >
      {initialized && opened ? children : <LockScreen />}
    </SecurityContext.Provider>
  );
}
