import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  updating: boolean;
  lastSuccessAt?: number;
  retry: () => void;
}>({ result: null, error: "", updating: false, retry: () => {} });

const SYNC_ERROR =
  "Не удалось обновить напоминания на устройстве. Повторите попытку.";

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { state, today, profile } = useFinance();
  const { ready, switching } = useFinanceStatus();
  const [revision, setRevision] = useState(0);
  // A changed ledger/profile invalidates the displayed result during render,
  // before the effect starts its next debounced request.
  const request = useMemo(
    () => ({ state, today, profile, ready, switching, revision }),
    [state, today, profile, ready, switching, revision],
  );
  const [completion, setCompletion] = useState<{
    request: typeof request;
    result: ReminderStatus | null;
    error: string;
  } | null>(null);
  const [lastSuccess, setLastSuccess] = useState<{
    profile: typeof profile;
    at: number;
  } | null>(null);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (status) => {
      if (status === "active") setRevision((n) => n + 1);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!request.ready || request.switching) return;
    let current = true;
    const timer = setTimeout(() => {
      void synchronizeReminders(request.state, request.profile)
        .then((value) => {
          if (current) {
            if (value.profile !== request.profile) throw new Error(SYNC_ERROR);
            setCompletion({
              request,
              result: value,
              error: value.status === "error" ? value.error || SYNC_ERROR : "",
            });
            if (value.status === "ready" || value.status === "off")
              setLastSuccess({ profile: request.profile, at: value.syncedAt });
          }
        })
        .catch(() => {
          if (current)
            setCompletion({ request, result: null, error: SYNC_ERROR });
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [request]);
  const current = completion?.request === request ? completion : null;
  return (
    <Context.Provider
      value={{
        result: current?.result ?? null,
        error: current?.error ?? "",
        updating: !current,
        lastSuccessAt:
          lastSuccess?.profile === profile ? lastSuccess.at : undefined,
        retry: () => setRevision((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useReminders = () => useContext(Context);
