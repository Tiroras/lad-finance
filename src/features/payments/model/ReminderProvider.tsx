import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useFinance, useFinanceStatus } from "../../../state/finance";
import { synchronizeReminders } from "../../../infrastructure/notifications/notifications";
import type { ReminderStatus } from "../../../infrastructure/notifications/notifications.types";

const Context = createContext<{
  result: ReminderStatus | null;
  error: string;
  retry: () => void;
}>({ result: null, error: "", retry: () => {} });
export function ReminderProvider({ children }: { children: ReactNode }) {
  const { state, today, profile } = useFinance();
  const { ready, switching } = useFinanceStatus();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ReminderStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (status) => {
      if (status === "active") setRevision((n) => n + 1);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!ready || switching) return;
    let current = true;
    const timer = setTimeout(() => {
      void synchronizeReminders(state, profile)
        .then((value) => {
          if (current) {
            setResult(value);
            setError("");
          }
        })
        .catch(() => {
          if (current)
            setError(
              "Не удалось обновить напоминания на устройстве. Повторите попытку.",
            );
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [state, ready, switching, today, revision, profile]);
  return (
    <Context.Provider
      value={{ result, error, retry: () => setRevision((n) => n + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useReminders = () => useContext(Context);
