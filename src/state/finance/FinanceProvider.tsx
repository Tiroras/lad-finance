import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { FinanceState } from "../../domain/types";
import { createInitialState } from "../../domain/seed";
import { ledgerStorage } from "../../infrastructure/storage/ledgerStorage";
import { LEGACY_STORAGE_KEY } from "../../infrastructure/storage/vault";
import { localDate } from "../../domain/finance";
import { successFeedback } from "../../infrastructure/device/feedback";

export const STORAGE_KEY = LEGACY_STORAGE_KEY;
interface ContextValue {
  state: FinanceState;
  update: (fn: (state: FinanceState) => FinanceState) => FinanceState;
  replace: (state: FinanceState) => void;
  ready: boolean;
  loadError: string;
  saveError: boolean;
  reload: () => void;
  retrySave: () => void;
  recover: (state: FinanceState) => Promise<void>;
  today: string;
  toast: string;
  notify: (message: string) => void;
}
const Context = createContext<ContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FinanceState>(() =>
    createInitialState(false),
  );
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  const replace = useCallback((value: FinanceState) => {
    stateRef.current = value;
    setState(value);
  }, []);
  const update = useCallback(
    (fn: (value: FinanceState) => FinanceState) => {
      const next = fn(stateRef.current);
      replace(next);
      return next;
    },
    [replace],
  );
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState("");
  const [today, setToday] = useState(localDate());
  const queue = useRef(Promise.resolve());
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const saved = await ledgerStorage.load();
      replace(saved ?? createInitialState());
      setReady(true);
    } catch {
      setLoadError(
        "Не удалось прочитать сохранённые данные. Они не перезаписаны. Повторите попытку или восстановите копию после проверки хранилища.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const persist = useCallback((value: FinanceState) => {
    queue.current = queue.current.then(async () => {
      try {
        await ledgerStorage.save(value);
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
    });
  }, []);
  const recover = useCallback(
    async (value: FinanceState) => {
      await queue.current;
      await ledgerStorage.recover(value);
      replace(value);
      setLoadError("");
      setSaveError(false);
      setReady(true);
    },
    [replace],
  );
  useEffect(() => {
    if (ready) persist(state);
  }, [state, ready, persist]);
  useEffect(() => {
    const timer = setInterval(() => setToday(localDate()), 30000);
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") setToday(localDate());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((message: string) => {
    setToast(message);
    successFeedback();
  }, []);
  return (
    <Context.Provider
      value={{
        state,
        ready,
        loadError,
        saveError,
        today,
        toast,
        notify,
        reload: load,
        retrySave: () => persist(state),
        recover,
        update,
        replace,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useFinance() {
  const value = useContext(Context);
  if (!value) throw new Error("FinanceProvider missing");
  return value;
}
