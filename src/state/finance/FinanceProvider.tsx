import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { FinanceState } from "../../domain/types";
import { createInitialState } from "../../domain/seed";
import {
  addProfile,
  createDefaultProfiles,
  renameProfile as renameProfileEntry,
  type DataDeletionRequest,
  type LedgerProfile,
} from "../../domain/profiles";
import { getLedgerStorage } from "../../infrastructure/storage/ledgerStorage";
import { getDraftStorage } from "../../infrastructure/storage/draftStorage";
import {
  readActiveProfile,
  readProfiles,
  writeProfiles,
  writeActiveProfile,
  generateProfileId,
  hasStoredProfiles,
  profileRecoveryStorage,
  type FinanceProfile,
} from "../../infrastructure/storage/profileStorage";
import { localDate } from "../../domain/finance";
import {
  assertBackupSize,
  backupByteLength,
  encodeBackup,
  MAX_BACKUP_BYTES,
  validateBackupValue,
} from "../../domain/backup";
import { successFeedback } from "../../infrastructure/device/feedback";
import { createSaveQueue } from "./saveQueue";
import { DEMO_ENABLED } from "../../shared/lib/buildOptions";
import { assertDemoAllowed, createStartupState } from "./demoMode";
import {
  createProfileRecovery,
  type ProfileRecoveryPreview,
  type ProfileRecoveryJournal,
  type ProfileRecoveryResult,
} from "../../infrastructure/storage/profileRecovery";
import {
  assertRecoverySnapshotSize,
  assertRestoreCandidateApplicable,
  fingerprintFinanceState,
  sameRestoreIdentity,
  type ContentFingerprint,
  type VerifiedRestoreCandidate,
} from "../../domain/backupRecovery";
import { captureBackupSource, type BackupSourceResult } from "./backupSource";
import { confirmFinanceSnapshot } from "./confirmedSave";
import { createDraftLifecycle } from "./draftLifecycle";
import {
  buildReplacementImportSummary,
  type BackupTransportFormat,
} from "../../domain/dataTransfer";
import {
  createImportController,
  pendingImportMessage,
  type CommitImportInput,
  type ImportController,
  type ImportControllerView,
  type ImportResult,
  type RestoreResultMetadata,
} from "./importController";

const {
  prepareReplacement: prepareDraftReplacement,
  settleReplacement: settleDraftReplacement,
} = createDraftLifecycle({
  drafts: getDraftStorage,
  inspect: (profile, normalizationDate) =>
    getLedgerStorage(profile).inspect({ normalizationDate }),
});

interface ContextValue {
  profile: FinanceProfile;
  profiles: readonly LedgerProfile[];
  activeProfile: LedgerProfile;
  state: FinanceState;
  update: (fn: (state: FinanceState) => FinanceState) => FinanceState;
  today: string;
  notify: (message: string) => void;
}
interface StatusValue extends ImportControllerView {
  financeWriteBlocked: boolean;
  retryImportSave: (id: string) => Promise<ImportResult>;
  openDeviceSnapshotAfterImport: (id: string) => Promise<ImportResult>;
  ready: boolean;
  needsIntroduction: boolean;
  finishIntroduction: () => Promise<FinanceState>;
  saveCurrentProfile: () => Promise<void>;
  confirmCurrentSave: (
    expectedProfile: FinanceProfile,
    expectedState: FinanceState,
  ) => Promise<void>;
  switching: boolean;
  switchProfile: (profile: FinanceProfile) => Promise<FinanceState>;
  createProfile: (name: string) => Promise<FinanceState>;
  renameProfile: (profile: FinanceProfile, name: string) => Promise<void>;
  deleteData: (request: DataDeletionRequest) => Promise<void>;
  canRecover: boolean;
  loadError: string;
  saveError: boolean;
  reload: () => void;
  retrySave: () => void;
  recover: (
    state: FinanceState,
    target?: FinanceProfile,
    metadata?: RestoreResultMetadata,
  ) => Promise<void | ImportResult>;
  catalogRecovery: boolean;
  recoveryPreview: ProfileRecoveryPreview | null;
  pendingRecovery: ProfileRecoveryJournal | null;
  scanProfileRecovery: () => Promise<void>;
  cancelProfileRecovery: () => void;
  confirmProfileRecovery: (target: FinanceProfile) => Promise<void>;
  resumeProfileRecovery: (
    decision: "continue" | "restore-original",
  ) => Promise<void>;
  restoreBackupToNewProfile: (input: {
    name: string;
    candidate: VerifiedRestoreCandidate;
    resultMetadata?: { format: BackupTransportFormat };
  }) => Promise<FinanceProfile>;
  getBackupSource: () => Promise<BackupSourceResult>;
}
const Context = createContext<ContextValue | null>(null);
const StatusContext = createContext<StatusValue | null>(null);
const ToastContext = createContext("");
const ImportCommitContext = createContext<
  ((input: CommitImportInput) => Promise<ImportResult>) | null
>(null);

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

async function savedRecoveryAllowance(
  profile: FinanceProfile,
  state: FinanceState | null,
) {
  if (!state) return undefined;
  const content = encodeBackup(state);
  if (
    content.length <= MAX_BACKUP_BYTES &&
    backupByteLength(content) <= MAX_BACKUP_BYTES
  )
    return undefined;
  const source = await getLedgerStorage(profile).inspect();
  return source.status === "readable" ? source.recovery?.allowance : undefined;
}

export function FinanceProvider({
  children,
  onDeleteData,
}: {
  children: ReactNode;
  onDeleteData: (request: DataDeletionRequest) => void;
}) {
  const [profile, setProfile] = useState<FinanceProfile>("personal");
  const [catalog, setCatalog] = useState(createDefaultProfiles);
  const catalogRef = useRef(catalog);
  const [canRecover, setCanRecover] = useState(false);
  const profileRef = useRef(profile);
  const operation = useRef(false);
  const importControllerRef = useRef<ImportController | null>(null);
  const restoreFormats = useRef(new Map<string, BackupTransportFormat>());
  const loaded = useRef(false);
  const [switching, setSwitching] = useState(false);
  const [catalogRecovery, setCatalogRecovery] = useState(false);
  const [recoveryPreview, setRecoveryPreview] =
    useState<ProfileRecoveryPreview | null>(null);
  const [pendingRecovery, setPendingRecovery] =
    useState<ProfileRecoveryJournal | null>(null);
  const [profileRecovery] = useState(() =>
    createProfileRecovery({
      storage: profileRecoveryStorage,
      ledger: getLedgerStorage,
      createId: () => generateProfileId().slice("profile-".length),
      demoEnabled: DEMO_ENABLED,
    }),
  );
  const [state, setState] = useState<FinanceState>(() =>
    createInitialState(false),
  );
  const [ready, setReady] = useState(false);
  const [needsIntroduction, setNeedsIntroduction] = useState(false);
  const stateRef = useRef(state);
  const revision = useRef(0);
  const snapshotBytes = useRef(0);
  const recoveryAllowance = useRef<ContentFingerprint | undefined>(undefined);
  const replace = useCallback(
    (value: FinanceState, bytes = backupByteLength(encodeBackup(value))) => {
      stateRef.current = value;
      revision.current += 1;
      snapshotBytes.current = bytes;
      setState(value);
      return revision.current;
    },
    [],
  );
  const validateNext = useCallback((next: FinanceState) => {
    assertDemoAllowed(next);
    assertProfileState(next, profileRef.current);
    const content = encodeBackup(next);
    return recoveryAllowance.current
      ? assertRecoverySnapshotSize(
          content,
          snapshotBytes.current,
          recoveryAllowance.current,
        )
      : assertBackupSize(content, snapshotBytes.current);
  }, []);
  const update = useCallback(
    (fn: (value: FinanceState) => FinanceState) => {
      if (importControllerRef.current?.hasPending())
        throw new Error(pendingImportMessage);
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
      const bytes = validateNext(next);
      replace(next, bytes);
      return next;
    },
    [replace, profile, validateNext],
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
  const activateProfile = useCallback(
    (
      target: FinanceProfile,
      next: FinanceState,
      allowance?: ContentFingerprint,
    ) => {
      recoveryAllowance.current = allowance;
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
  const [imports] = useState(() => {
    const controller = createImportController({
      context: () => ({
        profileId: profileRef.current,
        profileName:
          profileRef.current === "demo"
            ? "Демо"
            : (catalogRef.current.find((p) => p.id === profileRef.current)
                ?.name ?? "Личный"),
        state: stateRef.current,
        revision: revision.current,
        validationDate: localDate(),
        ready: loaded.current,
      }),
      acquireOperation: () => {
        if (operation.current)
          throw new Error("Дождитесь окончания текущей операции.");
        operation.current = true;
        setSwitching(true);
        return () => {
          operation.current = false;
          setSwitching(false);
        };
      },
      validateNext,
      installApplied: replace,
      flush: () => queue.flush(),
      async prepareRecovery(context) {
        if (context.ready) {
          queue.enqueue({ profile: context.profileId, state: context.state });
          await queue.flush();
          if (lastSaved.current.get(context.profileId) !== context.state)
            throw new Error("Не удалось сохранить прежний профиль.");
        } else await queue.flush();
      },
      async save(target, next, strategy) {
        if (strategy === "recover") {
          await getLedgerStorage(target).recover(next);
          return true;
        }
        queue.enqueue({ profile: target, state: next });
        await queue.flush();
        return lastSaved.current.get(target) === next;
      },
      inspect: (target, date) =>
        getLedgerStorage(target).inspect({ normalizationDate: date }),
      invalidateAcknowledgement: (target) => {
        lastSaved.current.delete(target);
      },
      acknowledge: (target, next) => {
        lastSaved.current.set(target, next);
        setSaveError(false);
      },
      activate: (target, next, allowance) => {
        // Foreign recovery is confirmed without invoking this port. Explicit
        // device-snapshot opening changes memory, never the saved preference.
        activateProfile(target, next, allowance);
        return revision.current;
      },
      nowIso: () => new Date().toISOString(),
      prepareReplacement: prepareDraftReplacement,
      async settleReplacement(target, snapshot) {
        await settleDraftReplacement(target, snapshot);
      },
    });
    importControllerRef.current = controller;
    return controller;
  });
  const importView = useSyncExternalStore(
    imports.subscribe,
    imports.getView,
    imports.getView,
  );
  const activateRecovered = useCallback(
    async (result: ProfileRecoveryResult) => {
      setPendingRecovery(result.journal);
      if (result.activationPending)
        throw new Error(
          "Список профилей восстановлен. Не удалось сохранить выбор профиля; продолжите восстановление.",
        );
      const target = result.journal.targetId;
      const inspection = result.inspection;
      // Keep the durable journal until both the verified snapshot and its summary
      // are ready. Reading a result must never start another financial write.
      let restored:
        | {
            summary: ReturnType<typeof buildReplacementImportSummary>;
            fingerprint: ContentFingerprint;
          }
        | undefined;
      if (result.journal.kind === "import") {
        const receipt =
          inspection.status === "readable"
            ? inspection.importedSnapshot
            : undefined;
        if (
          inspection.status !== "readable" ||
          inspection.state.demo ||
          !receipt ||
          receipt.operationId !== result.journal.operationId ||
          receipt.profileId !== target ||
          !result.journal.expectedSnapshot ||
          !sameRestoreIdentity(
            receipt.candidateIdentity,
            result.journal.expectedSnapshot,
          )
        )
          throw new Error(
            "Снимок нового профиля ещё не подтверждён. Продолжите восстановление с исходной копией.",
          );
        restored = {
          summary: buildReplacementImportSummary(
            null,
            inspection.state,
            inspection.snapshotDate,
            "new-profile",
          ),
          fingerprint: fingerprintFinanceState(inspection.state),
        };
      }
      // Reopen metadata and inspect only: ordinary load would migrate/delete plaintext.
      await profileRecovery.finish(result.journal.operationId);
      catalogRef.current = result.profiles;
      setCatalog(result.profiles);
      setPendingRecovery(null);
      setRecoveryPreview(null);
      setCatalogRecovery(false);
      setNeedsIntroduction(false);
      setCanRecover(true);
      if (result.inspection.status === "readable") {
        assertProfileState(result.inspection.state, target);
        activateProfile(
          target,
          result.inspection.state,
          result.inspection.recovery?.allowance,
        );
        if (restored) {
          imports.recordVerifiedRestore({
            id: `recovery:${result.journal.operationId}`,
            profileId: target,
            profileName:
              result.profiles.find((entry) => entry.id === target)?.name ??
              "Личный",
            format:
              restoreFormats.current.get(result.journal.operationId) ?? null,
            validationDate: result.inspection.snapshotDate,
            fingerprint: restored.fingerprint,
            summary: restored.summary,
            appliedRevision: revision.current,
          });
          restoreFormats.current.delete(result.journal.operationId);
        }
      } else {
        profileRef.current = target;
        setProfile(target);
        loaded.current = false;
        setReady(false);
        setLoadError(
          "Список профилей восстановлен, но снимок выбранного профиля пока недоступен. Его записи сохранены. Повторите чтение или восстановите копию.",
        );
      }
    },
    [activateProfile, profileRecovery, imports],
  );
  const load = useCallback(async () => {
    if (operation.current || imports.hasPending()) return;
    operation.current = true;
    setLoadError("");
    let catalogRead = false;
    try {
      setNeedsIntroduction(false);
      setCanRecover(false);
      setRecoveryPreview(null);
      const pending = await profileRecovery.readPending();
      setPendingRecovery(pending);
      if (pending) {
        setCatalogRecovery(true);
        loaded.current = false;
        setReady(false);
        if (
          pending.stage !== "restoring-original" &&
          (await profileRecoveryStorage.readCatalog()) ===
            pending.candidateRegistryRaw
        ) {
          await activateRecovered(
            await profileRecovery.resume(pending.operationId),
          );
          return;
        }
        setLoadError(
          "Восстановление списка профилей было прервано. Продолжите его или верните прежний список. Финансовые записи не удалены.",
        );
        return;
      }
      const entries = await readProfiles();
      catalogRead = true;
      setCatalogRecovery(false);
      catalogRef.current = entries;
      setCatalog(entries);
      if (entries.length === 0 || !(await hasStoredProfiles())) {
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
      if (saved)
        await settleDraftReplacement(selected, saved).catch(() => undefined);
      recoveryAllowance.current = await savedRecoveryAllowance(selected, saved);
      // A preference write must not turn a readable ledger into a recovery error.
      await writeActiveProfile(selected).catch(() => undefined);
      lastSaved.current.set(selected, saved);
      replace(saved ?? createStartupState(localDate(), selected === "demo"));
      loaded.current = true;
      setReady(true);
    } catch {
      setCatalogRecovery(!catalogRead);
      loaded.current = false;
      setReady(false);
      setLoadError(
        "Не удалось прочитать сохранённые данные или список профилей. Они не перезаписаны. Повторите загрузку. Если повреждены записи открываемого профиля, восстановите его копию.",
      );
    } finally {
      operation.current = false;
    }
  }, [replace, profileRecovery, activateRecovered, imports]);
  useEffect(() => {
    void load();
  }, [load]);
  const flushCurrentProfile = useCallback(async () => {
    if (imports.hasPending()) throw new Error(pendingImportMessage);
    const currentProfile = profileRef.current;
    const currentState = stateRef.current;
    // Capture the destination of every queued write before changing profiles.
    queue.enqueue({ profile: currentProfile, state: currentState });
    await queue.flush();
    if (lastSaved.current.get(currentProfile) !== currentState)
      throw new Error(
        "Не удалось сохранить текущий профиль. Повторите попытку.",
      );
  }, [queue, imports]);
  const getBackupSource = useCallback(async () => {
    if (imports.hasPending()) throw new Error(pendingImportMessage);
    if (!loaded.current || operation.current)
      throw new Error(
        "Дождитесь открытия профиля и повторите подготовку копии.",
      );
    const capturedProfile = profileRef.current;
    const capturedState = stateRef.current;
    const capturedRevision = revision.current;
    const capturedDate = localDate();
    const profileName =
      capturedProfile === "demo"
        ? "Демо"
        : (catalogRef.current.find((p) => p.id === capturedProfile)?.name ??
          "Личный");
    operation.current = true;
    setSwitching(true);
    try {
      return await captureBackupSource({
        profileId: capturedProfile,
        profileName,
        state: capturedState,
        revision: capturedRevision,
        today: capturedDate,
        save: async () => {
          queue.enqueue({ profile: capturedProfile, state: capturedState });
          await queue.flush();
          if (lastSaved.current.get(capturedProfile) !== capturedState)
            throw new Error("Снимок не подтверждён.");
        },
        inspect: (options) =>
          getLedgerStorage(capturedProfile).inspect(options),
      });
    } finally {
      operation.current = false;
      setSwitching(false);
    }
  }, [queue, imports]);
  const confirmCurrentSave = useCallback(
    async (expectedProfile: FinanceProfile, expectedState: FinanceState) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
      if (
        !loaded.current ||
        operation.current ||
        profileRef.current !== expectedProfile ||
        stateRef.current !== expectedState
      )
        throw new Error(
          "Данные профиля изменились. Откройте форму заново: сохранённая операция не будет добавлена повторно.",
        );
      operation.current = true;
      setSwitching(true);
      const date = localDate();
      try {
        await queue.flush();
        await confirmFinanceSnapshot({
          state: expectedState,
          today: date,
          save: async () => {
            // A stale acknowledgement must not suppress a write after read-back
            // found a different snapshot (for example an interrupted commit).
            lastSaved.current.delete(expectedProfile);
            queue.enqueue({ profile: expectedProfile, state: expectedState });
            await queue.flush();
          },
          inspect: () =>
            getLedgerStorage(expectedProfile).inspect({
              normalizationDate: date,
            }),
        });
        lastSaved.current.set(expectedProfile, expectedState);
        await settleDraftReplacement(
          expectedProfile,
          validateBackupValue(expectedState, date),
        );
        setSaveError(false);
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [queue, imports],
  );
  const scanProfileRecovery = useCallback(async () => {
    if (imports.hasPending()) throw new Error(pendingImportMessage);
    if (operation.current || !catalogRecovery)
      throw new Error("Дождитесь окончания загрузки.");
    operation.current = true;
    setSwitching(true);
    try {
      if (await profileRecovery.readPending())
        throw new Error("Сначала завершите прерванное восстановление.");
      setRecoveryPreview(await profileRecovery.scan());
    } finally {
      operation.current = false;
      setSwitching(false);
    }
  }, [catalogRecovery, profileRecovery, imports]);
  const rememberPendingRecovery = useCallback(async () => {
    let pending: ProfileRecoveryJournal | null;
    try {
      pending = await profileRecovery.readPending();
    } catch (error) {
      setCatalogRecovery(true);
      setCanRecover(false);
      loaded.current = false;
      setReady(false);
      setLoadError(
        "Не удалось прочитать состояние восстановления. Повторите загрузку; финансовые записи не заменены.",
      );
      throw error;
    }
    if (pending) {
      setPendingRecovery(pending);
      setCatalogRecovery(true);
      setCanRecover(false);
      loaded.current = false;
      setReady(false);
      setLoadError(
        "Восстановление не завершено. Продолжите его с прежними параметрами; финансовые записи сохранены.",
      );
    }
    return pending;
  }, [profileRecovery]);
  const confirmProfileRecovery = useCallback(
    async (target: FinanceProfile) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
      if (operation.current || !catalogRecovery || !recoveryPreview)
        throw new Error("Сначала проверьте сохранённые профили.");
      operation.current = true;
      setSwitching(true);
      try {
        const journal = await profileRecovery.prepare(recoveryPreview, target);
        setPendingRecovery(journal);
        await activateRecovered(
          await profileRecovery.resume(journal.operationId),
        );
      } catch (error) {
        await rememberPendingRecovery();
        throw error;
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [
      catalogRecovery,
      recoveryPreview,
      profileRecovery,
      activateRecovered,
      rememberPendingRecovery,
      imports,
    ],
  );
  const resumeProfileRecovery = useCallback(
    async (decision: "continue" | "restore-original") => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
      if (operation.current)
        throw new Error("Дождитесь окончания восстановления.");
      operation.current = true;
      setSwitching(true);
      let reloadOriginal = false;
      try {
        const pending = await profileRecovery.readPending();
        if (!pending)
          throw new Error(
            "Незавершённое восстановление не найдено. Повторите загрузку.",
          );
        if (decision === "restore-original") {
          await profileRecovery.restoreOriginal(pending.operationId);
          setPendingRecovery(null);
          setRecoveryPreview(null);
          reloadOriginal = true;
        } else
          await activateRecovered(
            await profileRecovery.resume(pending.operationId),
          );
      } catch (error) {
        await rememberPendingRecovery();
        throw error;
      } finally {
        operation.current = false;
        setSwitching(false);
      }
      if (reloadOriginal) await load();
    },
    [
      profileRecovery,
      activateRecovered,
      rememberPendingRecovery,
      load,
      imports,
    ],
  );
  const restoreBackupToNewProfile = useCallback(
    async ({
      name,
      candidate,
      resultMetadata,
    }: {
      name: string;
      candidate: VerifiedRestoreCandidate;
      resultMetadata?: { format: BackupTransportFormat };
    }) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
      assertRestoreCandidateApplicable(candidate, localDate());
      assertDemoAllowed({ ...candidate.state, demo: candidate.sourceDemo });
      if (operation.current)
        throw new Error(
          "Дождитесь открытия профиля и повторите восстановление.",
        );
      operation.current = true;
      setSwitching(true);
      try {
        if (loaded.current) await flushCurrentProfile();
        else await queue.flush();
        const result = await profileRecovery.importCandidate(name, candidate);
        if (resultMetadata)
          restoreFormats.current.set(
            result.journal.operationId,
            resultMetadata.format,
          );
        await activateRecovered(result);
        return result.journal.targetId;
      } catch (error) {
        const pending = await rememberPendingRecovery();
        if (
          resultMetadata &&
          pending?.kind === "import" &&
          pending.expectedSnapshot &&
          sameRestoreIdentity(candidate.identity, pending.expectedSnapshot)
        )
          restoreFormats.current.set(
            pending.operationId,
            resultMetadata.format,
          );
        throw error;
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [
      profileRecovery,
      activateRecovered,
      rememberPendingRecovery,
      flushCurrentProfile,
      queue,
      imports,
    ],
  );
  const recover = useCallback(
    async (
      value: FinanceState,
      target: FinanceProfile = profile,
      metadata?: RestoreResultMetadata,
    ) => {
      if (metadata) {
        return imports.recover({
          operationId: metadata.operationId,
          profileId: target,
          profileName:
            target === "demo"
              ? "Демо"
              : (catalogRef.current.find((entry) => entry.id === target)
                  ?.name ?? "Личный"),
          format: metadata.format,
          prepare(context) {
            assertDemoAllowed({
              ...value,
              demo: metadata.sourceDemo ?? value.demo,
            });
            if (!canRecover || profileRef.current !== profile)
              throw new Error(
                "Повторите открытие списка профилей перед восстановлением.",
              );
            if (
              target === "demo"
                ? !DEMO_ENABLED
                : !catalogRef.current.some((entry) => entry.id === target)
            )
              throw new Error("Профиль недоступен. Выберите его из списка.");
            const next = validateBackupValue(
              { ...value, demo: target === "demo" },
              context.validationDate,
            );
            assertBackupSize(encodeBackup(next));
            return {
              state: next,
              summary: buildReplacementImportSummary(
                context.ready && context.profileId === target
                  ? context.state
                  : null,
                next,
                context.validationDate,
              ),
            };
          },
        });
      }
      if (imports.hasPending()) throw new Error(pendingImportMessage);
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
        await prepareDraftReplacement({
          profileId: target,
          operationId: `recovery-${generateProfileId()}`,
          next,
          validationDate: localDate(),
        });
        await getLedgerStorage(target).recover(next);
        const verified = await getLedgerStorage(target).inspect({
          normalizationDate: localDate(),
        });
        if (verified.status !== "readable")
          throw new Error(
            "Не удалось подтвердить восстановление чтением. Повторите загрузку.",
          );
        await settleDraftReplacement(target, verified.state);
        lastSaved.current.set(target, next);
        if (target === profile) {
          recoveryAllowance.current = undefined;
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
    [replace, queue, profile, canRecover, flushCurrentProfile, imports],
  );
  const finishIntroduction = useCallback(async () => {
    if (imports.hasPending()) throw new Error(pendingImportMessage);
    if (!needsIntroduction || loaded.current || operation.current)
      throw new Error("Дождитесь создания профиля и повторите попытку.");
    operation.current = true;
    setSwitching(true);
    try {
      // Read again on retry: a previous attempt may have saved the ledger but
      // failed to save metadata. Never replace that ledger or an existing registry.
      const savedEntries = await readProfiles();
      const entries = savedEntries.length
        ? savedEntries
        : createDefaultProfiles();
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
  }, [needsIntroduction, activateProfile, imports]);
  const switchProfile = useCallback(
    async (target: FinanceProfile) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
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
        await settleDraftReplacement(target, next).catch(() => undefined);
        await writeActiveProfile(target);
        activateProfile(
          target,
          next,
          await savedRecoveryAllowance(target, saved),
        );
        return next;
      } finally {
        operation.current = false;
        setSwitching(false);
      }
    },
    [flushCurrentProfile, activateProfile, canRecover, imports],
  );
  const createProfile = useCallback(
    async (name: string) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
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
    [flushCurrentProfile, activateProfile, imports],
  );
  const renameProfile = useCallback(
    async (id: FinanceProfile, name: string) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
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
    [imports],
  );
  const deleteData = useCallback(
    async (request: DataDeletionRequest) => {
      if (imports.hasPending()) throw new Error(pendingImportMessage);
      if (!loaded.current || operation.current)
        throw new Error("Дождитесь открытия профиля и повторите попытку.");
      if (
        request.type === "profile" &&
        request.profile !== "demo" &&
        !catalogRef.current.some((entry) => entry.id === request.profile)
      )
        throw new Error("Профиль не найден. Откройте список заново.");
      operation.current = true;
      setSwitching(true);
      try {
        if (
          request.type === "profile" &&
          request.profile !== profileRef.current
        )
          await flushCurrentProfile();
        else await queue.flush();
        // The application unmounts every writer before touching storage. Keep
        // this provider locked until it is discarded, including async callbacks.
        onDeleteData(request);
      } catch (failure) {
        operation.current = false;
        setSwitching(false);
        throw failure;
      }
    },
    [imports, flushCurrentProfile, queue, onDeleteData],
  );
  useEffect(() => {
    if (
      ready &&
      !operation.current &&
      !imports.hasPending() &&
      state !== lastSaved.current.get(profile)
    )
      queue.enqueue({ profile, state });
  }, [
    state,
    ready,
    queue,
    profile,
    switching,
    imports,
    importView.pendingImportId,
  ]);
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
    const pendingId = imports.getView().pendingImportId;
    if (pendingId) {
      void imports.retry(pendingId).catch(() => undefined);
      return;
    }
    if (!operation.current && loaded.current)
      queue.enqueue({ profile: profileRef.current, state: stateRef.current });
  }, [queue, imports]);
  const profiles = useMemo<LedgerProfile[]>(
    () => (DEMO_ENABLED ? [...catalog, { id: "demo", name: "Демо" }] : catalog),
    [catalog],
  );
  const activeProfile =
    profiles.find((entry) => entry.id === profile) ??
    profiles[0] ??
    createDefaultProfiles()[0];
  const value = useMemo(
    () => ({ profile, profiles, activeProfile, state, today, update, notify }),
    [profile, profiles, activeProfile, state, today, update, notify],
  );
  const status = useMemo(
    () => ({
      ...importView,
      financeWriteBlocked:
        !ready || !!loadError || switching || !!importView.pendingImportId,
      retryImportSave: imports.retry,
      openDeviceSnapshotAfterImport: imports.openDeviceSnapshot,
      ready,
      needsIntroduction,
      finishIntroduction,
      saveCurrentProfile: flushCurrentProfile,
      confirmCurrentSave,
      switching,
      switchProfile,
      createProfile,
      renameProfile,
      deleteData,
      canRecover,
      loadError,
      saveError,
      reload: load,
      retrySave,
      recover,
      catalogRecovery,
      recoveryPreview,
      pendingRecovery,
      scanProfileRecovery,
      cancelProfileRecovery: () => setRecoveryPreview(null),
      confirmProfileRecovery,
      resumeProfileRecovery,
      restoreBackupToNewProfile,
      getBackupSource,
    }),
    [
      importView,
      imports,
      ready,
      needsIntroduction,
      finishIntroduction,
      flushCurrentProfile,
      confirmCurrentSave,
      switching,
      switchProfile,
      createProfile,
      renameProfile,
      deleteData,
      canRecover,
      loadError,
      saveError,
      load,
      retrySave,
      recover,
      catalogRecovery,
      recoveryPreview,
      pendingRecovery,
      scanProfileRecovery,
      confirmProfileRecovery,
      resumeProfileRecovery,
      restoreBackupToNewProfile,
      getBackupSource,
    ],
  );
  return (
    <ImportCommitContext.Provider value={imports.commit}>
      <Context.Provider value={value}>
        <StatusContext.Provider value={status}>
          <ToastContext.Provider value={toast}>
            {children}
          </ToastContext.Provider>
        </StatusContext.Provider>
      </Context.Provider>
    </ImportCommitContext.Provider>
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

/** Internal action gateway: callers outside state use useFinanceActions. */
export function useImportCommit() {
  const commit = useContext(ImportCommitContext);
  if (!commit) throw new Error("FinanceProvider missing");
  return commit;
}
