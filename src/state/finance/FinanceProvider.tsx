import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { FinanceState } from "../../domain/types";
import { createInitialState } from "../../domain/seed";
import { ledgerStorage } from "../../infrastructure/storage/ledgerStorage";
import { localDate } from "../../domain/finance";
import {
  assertBackupSize,
  backupByteLength,
  encodeBackup,
} from "../../domain/backup";
import { successFeedback } from "../../infrastructure/device/feedback";
import { createSaveQueue } from "./saveQueue";

interface ContextValue {
  state: FinanceState;
  update: (fn: (state: FinanceState) => FinanceState) => FinanceState;
  today: string;
  notify: (message: string) => void;
}
interface StatusValue {
  ready: boolean;
  loadError: string;
  saveError: boolean;
  reload: () => void;
  retrySave: () => void;
  recover: (state: FinanceState) => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);
const StatusContext = createContext<StatusValue | null>(null);
const ToastContext = createContext("");

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FinanceState>(() =>
    createInitialState(false),
  );
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  const snapshotBytes = useRef(0);
  const replace = useCallback(
    (value: FinanceState, bytes = backupByteLength(encodeBackup(value))) => {
      stateRef.current = value;
      snapshotBytes.current = bytes;
      setState(value);
    },
    [],
  );
  const update = useCallback(
    (fn: (value: FinanceState) => FinanceState) => {
      const next = fn(stateRef.current);
      if (next === stateRef.current) return next;
      const bytes = assertBackupSize(encodeBackup(next), snapshotBytes.current);
      replace(next, bytes);
      return next;
    },
    [replace],
  );
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState("");
  const [today, setToday] = useState(localDate());
  const lastSaved = useRef<FinanceState | null>(null);
  const [queue] = useState(() =>
    createSaveQueue<FinanceState>(async (value) => {
      if (value === lastSaved.current) return;
      await ledgerStorage.save(value);
      lastSaved.current = value;
    }, setSaveError),
  );
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const saved = await ledgerStorage.load();
      const initial = saved ?? createInitialState();
      lastSaved.current = saved;
      replace(
        saved
          ? initial
          : {
              ...initial,
              settings: { ...initial.settings, onboardingCompleted: false },
            },
      );
      setReady(true);
    } catch {
      setLoadError(
        "Не удалось прочитать сохранённые данные. Они не перезаписаны. Повторите попытку или восстановите копию после проверки хранилища.",
      );
    }
  }, [replace]);
  useEffect(() => {
    void load();
  }, [load]);
  const recover = useCallback(
    async (value: FinanceState) => {
      await queue.flush();
      await ledgerStorage.recover(value);
      lastSaved.current = value;
      replace(value);
      setLoadError("");
      setSaveError(false);
      setReady(true);
    },
    [replace, queue],
  );
  useEffect(() => {
    if (ready && state !== lastSaved.current) queue.enqueue(state);
  }, [state, ready, queue]);
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
  const retrySave = useCallback(() => queue.enqueue(stateRef.current), [queue]);
  const value = useMemo(
    () => ({ state, today, update, notify }),
    [state, today, update, notify],
  );
  const status = useMemo(
    () => ({ ready, loadError, saveError, reload: load, retrySave, recover }),
    [ready, loadError, saveError, load, retrySave, recover],
  );
  return (
    <Context.Provider value={value}>
      <StatusContext.Provider value={status}>
        <ToastContext.Provider value={toast}>{children}</ToastContext.Provider>
      </StatusContext.Provider>
    </Context.Provider>
  );
}

export function useFinance() {
  const value = useContext(Context);
  if (!value) throw new Error("FinanceProvider missing");
  return value;
}

export function useFinanceStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error("FinanceProvider missing");
  return value;
}

export const useFinanceToast = () => useContext(ToastContext);
