import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useFinance } from "../../store";
import { synchronizeReminders } from "../../services/notifications";
import type { ReminderStatus } from "../../services/notifications.types";

const Context = createContext<{
  result: ReminderStatus | null;
  error: string;
  retry: () => void;
}>({ result: null, error: "", retry: () => {} });
export function ReminderProvider({ children }: { children: ReactNode }) {
  const { state, ready, today } = useFinance();
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
    if (!ready) return;
    let current = true;
    const timer = setTimeout(() => {
      void synchronizeReminders(state)
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
  }, [state, ready, today, revision]);
  return (
    <Context.Provider
      value={{ result, error, retry: () => setRevision((n) => n + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useReminders = () => useContext(Context);
