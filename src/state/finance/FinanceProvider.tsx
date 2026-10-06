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
import {
  addProfile,
  createDefaultProfiles,
  renameProfile as renameProfileEntry,
  type LedgerProfile,
} from "../../domain/profiles";
import { getLedgerStorage } from "../../infrastructure/storage/ledgerStorage";
import {
  readActiveProfile,
  readProfiles,
  writeProfiles,
  writeActiveProfile,
  generateProfileId,
  hasStoredProfiles,
  type FinanceProfile,
} from "../../infrastructure/storage/profileStorage";
import { localDate } from "../../domain/finance";
import {
  assertBackupSize,
  backupByteLength,
  encodeBackup,
} from "../../domain/backup";
import { successFeedback } from "../../infrastructure/device/feedback";
import { createSaveQueue } from "./saveQueue";
import { DEMO_ENABLED } from "../../shared/lib/buildOptions";
import { assertDemoAllowed, createStartupState } from "./demoMode";

interface ContextValue {
  profile: FinanceProfile;
  profiles: readonly LedgerProfile[];
  activeProfile: LedgerProfile;
  state: FinanceState;
  update: (fn: (state: FinanceState) => FinanceState) => FinanceState;
  today: string;
  notify: (message: string) => void;
}
interface StatusValue {
  ready: boolean;
  needsIntroduction: boolean;
  finishIntroduction: () => Promise<FinanceState>;
  saveCurrentProfile: () => Promise<void>;
  switching: boolean;
  switchProfile: (profile: FinanceProfile) => Promise<FinanceState>;
  createProfile: (name: string) => Promise<FinanceState>;
  renameProfile: (profile: FinanceProfile, name: string) => Promise<void>;
  canRecover: boolean;
  loadError: string;
  saveError: boolean;
  reload: () => void;
  retrySave: () => void;
  recover: (state: FinanceState, target?: FinanceProfile) => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);
const StatusContext = createContext<StatusValue | null>(null);
const ToastContext = createContext("");

export class ProfileReadError extends Error {
  constructor(readonly profile: FinanceProfile) {
    super(
      "Не удалось прочитать профиль. Его данные не изменены. Повторите открытие или восстановите его копию.",
    );
    this.name = "ProfileReadError";
  }
}

function assertProfileState(state: FinanceState, profile: FinanceProfile) {
  if (state.demo !== (profile === "demo"))
    throw new Error(
      "Данные относятся к другому профилю. Переключите профиль или восстановите его копию.",
    );
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<FinanceProfile>("personal");
  const [catalog, setCatalog] = useState(createDefaultProfiles);
  const catalogRef = useRef(catalog);
  const [canRecover, setCanRecover] = useState(false);
  const profileRef = useRef(profile);
  const operation = useRef(false);
  const loaded = useRef(false);
  const [switching, setSwitching] = useState(false);
  const [state, setState] = useState<FinanceState>(() =>
    createInitialState(false),
  );
  const [ready, setReady] = useState(false);
  const [needsIntroduction, setNeedsIntroduction] = useState(false);
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
      if (
        !loaded.current ||
        operation.current ||
        profileRef.current !== profile
      )
        throw new Error("Профиль изменился. Откройте форму заново.");
      const next = fn(stateRef.current);
      assertDemoAllowed(next);
      assertProfileState(next, profile);
      if (next === stateRef.current) return next;
      const bytes = assertBackupSize(encodeBackup(next), snapshotBytes.current);
      replace(next, bytes);
      return next;
    },
    [replace, profile],
  );
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState("");
  const [today, setToday] = useState(localDate());
  const lastSaved = useRef(new Map<FinanceProfile, FinanceState | null>());
  const [queue] = useState(() =>
    createSaveQueue<{ profile: FinanceProfile; state: FinanceState }>(
      async ({ profile, state }) => {
        if (state === lastSaved.current.get(profile)) return;
        await getLedgerStorage(profile).save(state);
        lastSaved.current.set(profile, state);
      },
      setSaveError,
    ),
  );
  const load = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setLoadError("");
    try {
      setNeedsIntroduction(false);
      setCanRecover(false);
      const entries = await readProfiles();
      catalogRef.current = entries;
      setCatalog(entries);
      if (!(await hasStoredProfiles())) {
        // A fresh installation stays read-only until the welcome flow is finished.
        loaded.current = false;
        setReady(false);
        setNeedsIntroduction(true);
        return;
      }
      const selected = await readActiveProfile(DEMO_ENABLED, entries);
      profileRef.current = selected;
      setProfile(selected);
      setCanRecover(true);
      const saved = await getLedgerStorage(selected).load();
      if (saved) assertProfileState(saved, selected);
      // A preference write must not turn a readable ledger into a recovery error.
      await writeActiveProfile(selected).catch(() => undefined);
      lastSaved.current.set(selected, saved);
      replace(saved ?? createStartupState(localDate(), selected === "demo"));
      loaded.current = true;
      setReady(true);
    } catch {
      loaded.current = false;
      setReady(false);
      setLoadError(
        "Не удалось прочитать сохранённые данные или список профилей. Они не перезаписаны. Повторите загрузку. Если повреждены записи открываемого профиля, восстановите его копию.",
      );
    } finally {
      operation.current = false;
    }
  }, [replace]);
  useEffect(() => {
    void load();
  }, [load]);
  const flushCurrentProfile = useCallback(async () => {
    const currentProfile = profileRef.current;
    const currentState = stateRef.current;
    // Capture the destination of every queued write before changing profiles.
    queue.enqueue({ profile: currentProfile, state: currentState });
    await queue.flush();
    if (lastSaved.current.get(currentProfile) !== currentState)
      throw new Error(
        "Не удалось сохранить текущий профиль. Повторите попытку.",
      );
  }, [queue]);
  const recover = useCallback(
    async (value: FinanceState, target: FinanceProfile = profile) => {
      assertDemoAllowed(value);
      if (!canRecover)
        throw new Error(
          "Сначала повторите загрузку списка профилей. Финансовая копия не заменяет список профилей.",
        );
      if (operation.current || profileRef.current !== profile)
        throw new Error("Дождитесь открытия профиля и повторите попытку.");
      if (
        target === "demo"
          ? !DEMO_ENABLED
          : !catalogRef.current.some((entry) => entry.id === target)
      )
        throw new Error("Профиль недоступен. Выберите его из списка.");
      operation.current = true;
      setSwitching(true);
      try {
        if (loaded.current) await flushCurrentProfile();
        else await queue.flush();
        const next = { ...value, demo: target === "demo" };
        await getLedgerStorage(target).recover(next);
        lastSaved.current.set(target, next);
        if (target === profile) {
          replace(next);
          setLoadError("");
          setSaveError(false);
          loaded.current = true;
          setReady(true);
        }
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [replace, queue, profile, canRecover, flushCurrentProfile],
  );
  const activateProfile = useCallback(
    (target: FinanceProfile, next: FinanceState) => {
      lastSaved.current.set(target, next);
      profileRef.current = target;
      setProfile(target);
      replace(next);
      loaded.current = true;
      setReady(true);
      setLoadError("");
      setSaveError(false);
      setToast("");
    },
    [replace],
  );
  const finishIntroduction = useCallback(async () => {
    if (!needsIntroduction || loaded.current || operation.current)
      throw new Error("Дождитесь создания профиля и повторите попытку.");
    operation.current = true;
    setSwitching(true);
    try {
      // Read again on retry: a previous attempt may have saved the ledger but
      // failed to save metadata. Never replace that ledger or an existing registry.
      const entries = await readProfiles();
      const storage = getLedgerStorage("personal");
      const saved = await storage.load();
      if (saved) assertProfileState(saved, "personal");
      const next = saved ?? createStartupState(localDate(), false);
      if (!saved) await storage.save(next);
      await writeProfiles(entries);
      await writeActiveProfile("personal");
      catalogRef.current = entries;
      setCatalog(entries);
      setCanRecover(true);
      setNeedsIntroduction(false);
      activateProfile("personal", next);
      return next;
    } catch {
      throw new Error(
        "Не удалось завершить создание профиля. Данные не заменены. Попробуйте ещё раз.",
      );
    } finally {
      operation.current = false;
      setSwitching(false);
    }
  }, [needsIntroduction, activateProfile]);
  const switchProfile = useCallback(
    async (target: FinanceProfile) => {
      if (target === "demo" && !DEMO_ENABLED)
        throw new Error("Демонстрационный профиль недоступен в этой версии.");
      if ((!loaded.current && !canRecover) || operation.current)
        throw new Error("Дождитесь открытия профиля и повторите попытку.");
      if (
        target !== "demo" &&
        !catalogRef.current.some((entry) => entry.id === target)
      )
        throw new Error("Профиль не найден. Выберите его из списка.");
      if (target === profileRef.current && loaded.current)
        return stateRef.current;
      operation.current = true;
      setSwitching(true);
      try {
        if (loaded.current) await flushCurrentProfile();
        const storage = getLedgerStorage(target);
        let saved: FinanceState | null;
        try {
          saved = await storage.load();
          if (saved) assertProfileState(saved, target);
        } catch {
          throw new ProfileReadError(target);
        }
        const next =
          saved ?? createStartupState(localDate(), target === "demo");
        // Keep the current profile open if loading or saving the destination fails.
        if (!saved) await storage.save(next);
        await writeActiveProfile(target);
        activateProfile(target, next);
        return next;
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [flushCurrentProfile, activateProfile, canRecover],
  );
  const createProfile = useCallback(
    async (name: string) => {
      if (!loaded.current || operation.current)
        throw new Error("Дождитесь открытия профиля и повторите попытку.");
      const id = generateProfileId();
      const entries = addProfile(catalogRef.current, id, name);
      operation.current = true;
      setSwitching(true);
      try {
        await flushCurrentProfile();
        const next = createStartupState(localDate(), false);
        await getLedgerStorage(id).save(next);
        // Publish the name only after the new ledger has been written successfully.
        await writeProfiles(entries);
        catalogRef.current = entries;
        setCatalog(entries);
        try {
          await writeActiveProfile(id);
        } catch {
          throw new Error(
            "Профиль создан, но переключиться не удалось. Откройте его из списка профилей.",
          );
        }
        activateProfile(id, next);
        return next;
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [flushCurrentProfile, activateProfile],
  );
  const renameProfile = useCallback(
    async (id: FinanceProfile, name: string) => {
      if (!loaded.current || operation.current)
        throw new Error("Дождитесь открытия профиля и повторите попытку.");
      const entries = renameProfileEntry(catalogRef.current, id, name);
      operation.current = true;
      setSwitching(true);
      try {
        await writeProfiles(entries);
        catalogRef.current = entries;
        setCatalog(entries);
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [],
  );
  useEffect(() => {
    if (ready && !operation.current && state !== lastSaved.current.get(profile))
      queue.enqueue({ profile, state });
  }, [state, ready, queue, profile, switching]);
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
  const retrySave = useCallback(() => {
    if (!operation.current && loaded.current)
      queue.enqueue({ profile: profileRef.current, state: stateRef.current });
  }, [queue]);
  const profiles = useMemo<LedgerProfile[]>(
    () => (DEMO_ENABLED ? [...catalog, { id: "demo", name: "Демо" }] : catalog),
    [catalog],
  );
  const activeProfile =
    profiles.find((entry) => entry.id === profile) ?? profiles[0];
  const value = useMemo(
    () => ({ profile, profiles, activeProfile, state, today, update, notify }),
    [profile, profiles, activeProfile, state, today, update, notify],
  );
  const status = useMemo(
    () => ({
      ready,
      needsIntroduction,
      finishIntroduction,
      saveCurrentProfile: flushCurrentProfile,
      switching,
      switchProfile,
      createProfile,
      renameProfile,
      canRecover,
      loadError,
      saveError,
      reload: load,
      retrySave,
      recover,
    }),
    [
      ready,
      needsIntroduction,
      finishIntroduction,
      flushCurrentProfile,
      switching,
      switchProfile,
      createProfile,
      renameProfile,
      canRecover,
      loadError,
      saveError,
      load,
      retrySave,
      recover,
    ],
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
