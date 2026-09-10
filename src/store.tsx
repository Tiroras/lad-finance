import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import type { FinanceState } from "./domain/types";
import { createInitialState } from "./domain/seed";
import { decodeBackup, encodeBackup } from "./domain/backup";
import { localDate } from "./domain/finance";

export const STORAGE_KEY = "lad-finance-v1";
interface ContextValue {
  state: FinanceState;
  update: (fn: (state: FinanceState) => FinanceState) => void;
  replace: (state: FinanceState) => void;
  ready: boolean;
  loadError: string;
  saveError: boolean;
  reload: () => void;
  retrySave: () => void;
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
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState("");
  const [today, setToday] = useState(localDate());
  const queue = useRef(Promise.resolve());
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setState(raw ? decodeBackup(raw) : createInitialState());
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
        await AsyncStorage.setItem(STORAGE_KEY, encodeBackup(value));
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
    });
  }, []);
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
    if (Platform.OS !== "web")
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
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
        update: setState,
        replace: setState,
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
