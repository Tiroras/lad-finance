import {
  addProfile,
  decodeProfileRegistry,
  encodeProfileRegistry,
  isFinanceProfile,
  recoveredProfileEntries,
  type FinanceProfile,
  type LedgerProfile,
} from "../../domain/profiles";
import {
  assertVerifiedRestoreCandidate,
  parseRestoreCandidateIdentity,
  sameRestoreIdentity,
  type VerifiedRestoreCandidate,
  type RestoreCandidateIdentity,
} from "../../domain/backupRecovery";
import type {
  LedgerInspection,
  VerifiedSnapshotReceipt,
} from "./ledgerContracts";

export interface ProfileRecoveryStorage {
  getAllKeys(): Promise<readonly string[]>;
  readCatalog(): Promise<string | null>;
  writeCatalog(raw: string | null): Promise<unknown>;
  readActive(): Promise<string | null>;
  writeActive(raw: string | null): Promise<unknown>;
  readJournal(): Promise<string | null>;
  writeJournal(raw: string): Promise<unknown>;
  removeJournal(): Promise<unknown>;
}
type RecoveryLedger = {
  inspect(options?: { normalizationDate?: string }): Promise<LedgerInspection>;
  writeImportedSnapshot(
    candidate: VerifiedRestoreCandidate,
    options: { operationId: string },
  ): Promise<VerifiedSnapshotReceipt>;
};
export interface ProfileRecoveryEntry extends LedgerProfile {
  status: LedgerInspection["status"];
  summary?: { accounts: number; transactions: number; goals: number };
}
export interface ProfileRecoveryPreview {
  originalRegistryRaw: string | null;
  originalActiveRaw: string | null;
  profiles: readonly LedgerProfile[];
  entries: readonly ProfileRecoveryEntry[];
}
export interface ProfileRecoveryJournal {
  version: 1;
  operationId: string;
  kind: "registry" | "import";
  originalRegistryRaw: string | null;
  originalActiveRaw: string | null;
  candidateRegistryRaw: string;
  targetId: FinanceProfile;
  stage:
    | "prepared"
    | "snapshot-verified"
    | "catalog-verified"
    | "restoring-original";
  expectedSnapshot?: RestoreCandidateIdentity;
}
export interface ProfileRecoveryResult {
  journal: ProfileRecoveryJournal;
  profiles: LedgerProfile[];
  inspection: LedgerInspection;
  activationPending: boolean;
}
const conflict = () =>
  new Error(
    "Список профилей изменился. Повторите проверку; сохранённые данные не заменены.",
  );
const journalError = () =>
  new Error(
    "Не удалось проверить журнал восстановления. Данные сохранены; повторите загрузку.",
  );
const validOperation = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);

/** Strict allowlist: old shared records and unknown profile-local keys are excluded. */
export function profileIdsFromStorageKeys(
  keys: readonly string[],
): FinanceProfile[] {
  const result = new Set<FinanceProfile>();
  for (const key of keys) {
    const match =
      /^lad-profile-([^:]+):(lad-finance-v1|lad-finance-encrypted-v1)$/.exec(
        key,
      );
    if (match && isFinanceProfile(match[1])) result.add(match[1]);
  }
  return [...result].sort();
}

/** Metadata recovery only; financial writers are used solely for a fresh import target. */
export function createProfileRecovery({
  storage,
  ledger,
  createId,
  demoEnabled,
}: {
  storage: ProfileRecoveryStorage;
  ledger: (profile: FinanceProfile) => RecoveryLedger;
  createId: () => string;
  demoEnabled: boolean;
}) {
  let busy = false;
  const previews = new WeakSet<ProfileRecoveryPreview>();
  async function exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("Дождитесь завершения восстановления.");
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  }
  function parseJournal(raw: string): ProfileRecoveryJournal {
    try {
      const value = JSON.parse(raw);
      if (
        !value ||
        value.version !== 1 ||
        !validOperation(value.operationId) ||
        !["registry", "import"].includes(value.kind) ||
        ![
          "prepared",
          "snapshot-verified",
          "catalog-verified",
          "restoring-original",
        ].includes(value.stage) ||
        !(
          value.originalRegistryRaw === null ||
          typeof value.originalRegistryRaw === "string"
        ) ||
        !(
          value.originalActiveRaw === null ||
          typeof value.originalActiveRaw === "string"
        ) ||
        typeof value.candidateRegistryRaw !== "string" ||
        !isFinanceProfile(value.targetId)
      )
        throw journalError();
      const profiles = decodeProfileRegistry(value.candidateRegistryRaw);
      if (
        value.targetId === "demo"
          ? !demoEnabled
          : !profiles.some((p) => p.id === value.targetId)
      )
        throw journalError();
      const expectedSnapshot =
        value.kind === "import"
          ? parseRestoreCandidateIdentity(value.expectedSnapshot)
          : undefined;
      if (
        value.kind === "import" &&
        (value.targetId === "demo" || value.targetId === "personal")
      )
        throw journalError();
      return {
        version: 1,
        operationId: value.operationId,
        kind: value.kind,
        originalRegistryRaw: value.originalRegistryRaw,
        originalActiveRaw: value.originalActiveRaw,
        candidateRegistryRaw: value.candidateRegistryRaw,
        targetId: value.targetId,
        stage: value.stage,
        ...(expectedSnapshot ? { expectedSnapshot } : {}),
      };
    } catch {
      throw journalError();
    }
  }
  async function readPending(): Promise<ProfileRecoveryJournal | null> {
    const raw = await storage.readJournal();
    return raw === null ? null : parseJournal(raw);
  }
  async function writeJournal(journal: ProfileRecoveryJournal) {
    const raw = JSON.stringify(parseJournal(JSON.stringify(journal)));
    await storage.writeJournal(raw);
    if ((await storage.readJournal()) !== raw) throw journalError();
  }
  async function removeJournalVerified() {
    try {
      await storage.removeJournal();
    } catch (error) {
      if ((await storage.readJournal()) !== null) throw error;
    }
    if ((await storage.readJournal()) !== null) throw journalError();
  }
  async function requireJournal(operationId: string) {
    const current = await readPending();
    if (!current || current.operationId !== operationId) throw conflict();
    return current;
  }
  async function assertOriginal(
    preview: Pick<
      ProfileRecoveryPreview,
      "originalRegistryRaw" | "originalActiveRaw"
    >,
  ) {
    if (
      (await storage.readCatalog()) !== preview.originalRegistryRaw ||
      (await storage.readActive()) !== preview.originalActiveRaw
    )
      throw conflict();
  }
  async function scan(): Promise<ProfileRecoveryPreview> {
    const originalRegistryRaw = await storage.readCatalog();
    const originalActiveRaw = await storage.readActive();
    const ids = new Set(profileIdsFromStorageKeys(await storage.getAllKeys()));
    ids.add("personal");
    try {
      const raw =
        originalRegistryRaw === null ? null : JSON.parse(originalRegistryRaw);
      if (raw?.version === 1 && Array.isArray(raw.profiles)) {
        for (const entry of raw.profiles)
          if (entry && isFinanceProfile(entry.id)) ids.add(entry.id);
      }
    } catch {
      /* Names can be unavailable while ledger namespaces remain intact. */
    }
    const profiles = recoveredProfileEntries(originalRegistryRaw, [...ids]);
    const choices =
      demoEnabled && ids.has("demo")
        ? [...profiles, { id: "demo" as const, name: "Демо" }]
        : profiles;
    const entries: ProfileRecoveryEntry[] = [];
    for (const entry of choices) {
      const inspected = await ledger(entry.id).inspect();
      const compatible =
        inspected.status !== "readable" ||
        inspected.state.demo === (entry.id === "demo");
      entries.push(
        Object.freeze({
          ...entry,
          status: compatible ? inspected.status : "damaged",
          ...(inspected.status === "readable" && compatible
            ? {
                summary: Object.freeze({
                  accounts: inspected.state.accounts.length,
                  transactions: inspected.state.transactions.length,
                  goals: inspected.state.goals.length,
                }),
              }
            : {}),
        }),
      );
    }
    const preview = Object.freeze({
      originalRegistryRaw,
      originalActiveRaw,
      profiles: Object.freeze(profiles.map((p) => Object.freeze(p))),
      entries: Object.freeze(entries),
    });
    await assertOriginal(preview);
    previews.add(preview);
    return preview;
  }
  async function prepare(
    preview: ProfileRecoveryPreview,
    targetId: FinanceProfile,
  ) {
    return exclusive(async () => {
      if (!previews.has(preview)) throw conflict();
      if (await readPending())
        throw new Error("Сначала завершите прежнее восстановление.");
      const target = preview.entries.find((p) => p.id === targetId);
      if (!target || target.status === "missing")
        throw new Error(
          "В этом профиле нет сохранённого снимка. Выберите другой профиль или восстановите копию в новый.",
        );
      await assertOriginal(preview);
      const journal: ProfileRecoveryJournal = {
        version: 1,
        operationId: createId(),
        kind: "registry",
        targetId,
        stage: "prepared",
        originalRegistryRaw: preview.originalRegistryRaw,
        originalActiveRaw: preview.originalActiveRaw,
        candidateRegistryRaw: encodeProfileRegistry(preview.profiles),
      };
      await writeJournal(journal);
      return journal;
    });
  }
  function receiptMatches(
    journal: ProfileRecoveryJournal,
    receipt: VerifiedSnapshotReceipt | undefined,
  ) {
    return (
      receipt !== undefined &&
      receipt.operationId === journal.operationId &&
      receipt.profileId === journal.targetId &&
      journal.expectedSnapshot !== undefined &&
      sameRestoreIdentity(receipt.candidateIdentity, journal.expectedSnapshot)
    );
  }
  async function ensureImport(
    journal: ProfileRecoveryJournal,
    candidate?: VerifiedRestoreCandidate,
  ) {
    if (candidate) {
      assertVerifiedRestoreCandidate(candidate);
      if (
        !journal.expectedSnapshot ||
        !sameRestoreIdentity(candidate.identity, journal.expectedSnapshot)
      )
        throw new Error(
          "Выбрана другая копия. Для продолжения нужен исходный проверенный файл.",
        );
    }
    const target = ledger(journal.targetId);
    const inspected = await target.inspect();
    if (
      inspected.status === "readable" &&
      receiptMatches(journal, inspected.importedSnapshot)
    )
      return;
    if (!candidate)
      throw new Error(
        "Выберите исходную копию ещё раз, чтобы продолжить восстановление в тот же новый профиль.",
      );
    if (inspected.status === "readable") throw conflict();
    const receipt = await target.writeImportedSnapshot(candidate, {
      operationId: journal.operationId,
    });
    if (!receiptMatches(journal, receipt)) throw journalError();
    const reread = await target.inspect();
    if (
      reread.status !== "readable" ||
      !receiptMatches(journal, reread.importedSnapshot)
    )
      throw journalError();
  }
  async function resumeInternal(
    operationId: string,
    candidate?: VerifiedRestoreCandidate,
  ): Promise<ProfileRecoveryResult> {
    let journal = await requireJournal(operationId);
    if (journal.stage === "restoring-original")
      throw new Error("Завершите возврат к прежнему списку профилей.");
    let current = await storage.readCatalog();
    if (
      current !== journal.originalRegistryRaw &&
      current !== journal.candidateRegistryRaw
    )
      throw conflict();
    if (journal.kind === "import") {
      await ensureImport(journal, candidate);
      if (journal.stage === "prepared") {
        journal = { ...journal, stage: "snapshot-verified" };
        await writeJournal(journal);
      }
    }
    current = await storage.readCatalog();
    if (
      current !== journal.originalRegistryRaw &&
      current !== journal.candidateRegistryRaw
    )
      throw conflict();
    if (current !== journal.candidateRegistryRaw)
      await storage.writeCatalog(journal.candidateRegistryRaw);
    if ((await storage.readCatalog()) !== journal.candidateRegistryRaw)
      throw conflict();
    if (journal.stage !== "catalog-verified") {
      journal = { ...journal, stage: "catalog-verified" };
      await writeJournal(journal);
    }
    let activationPending = false;
    try {
      await storage.writeActive(journal.targetId);
      activationPending = (await storage.readActive()) !== journal.targetId;
    } catch {
      activationPending = true;
    }
    const inspected = await ledger(journal.targetId).inspect();
    const inspection: LedgerInspection =
      inspected.status === "readable" &&
      inspected.state.demo !== (journal.targetId === "demo")
        ? { status: "damaged", reason: "financial-json" }
        : inspected;
    return {
      journal,
      profiles: decodeProfileRegistry(journal.candidateRegistryRaw),
      inspection,
      activationPending,
    };
  }
  async function restoreOriginal(operationId: string) {
    let journal = await requireJournal(operationId);
    const current = await storage.readCatalog();
    if (
      current !== journal.originalRegistryRaw &&
      current !== journal.candidateRegistryRaw
    )
      throw conflict();
    journal = { ...journal, stage: "restoring-original" };
    await writeJournal(journal);
    await storage.writeCatalog(journal.originalRegistryRaw);
    if ((await storage.readCatalog()) !== journal.originalRegistryRaw)
      throw conflict();
    await storage.writeActive(journal.originalActiveRaw);
    if ((await storage.readActive()) !== journal.originalActiveRaw)
      throw conflict();
    await removeJournalVerified();
  }
  async function finish(operationId: string) {
    return exclusive(async () => {
      const journal = await requireJournal(operationId);
      const raw = await storage.readCatalog();
      if (
        raw !== journal.candidateRegistryRaw ||
        (await storage.readActive()) !== journal.targetId
      )
        throw conflict();
      decodeProfileRegistry(raw);
      await removeJournalVerified();
    });
  }
  async function importCandidate(
    name: string,
    candidate: VerifiedRestoreCandidate,
  ) {
    return exclusive(async () => {
      assertVerifiedRestoreCandidate(candidate);
      let journal = await readPending();
      if (journal) {
        if (journal.kind !== "import")
          throw new Error("Сначала завершите восстановление списка профилей.");
        const target = decodeProfileRegistry(journal.candidateRegistryRaw).find(
          (p) => p.id === journal!.targetId,
        );
        if (target?.name !== name.trim().normalize("NFC"))
          throw new Error(
            "Продолжите восстановление с прежним названием нового профиля.",
          );
      } else {
        const preview = await scan();
        const targetId = `profile-${createId()}`;
        if (!isFinanceProfile(targetId)) throw journalError();
        if ((await ledger(targetId).inspect()).status !== "missing")
          throw conflict();
        const profiles = addProfile(preview.profiles, targetId, name);
        await assertOriginal(preview);
        journal = {
          version: 1,
          operationId: createId(),
          kind: "import",
          targetId,
          originalRegistryRaw: preview.originalRegistryRaw,
          originalActiveRaw: preview.originalActiveRaw,
          candidateRegistryRaw: encodeProfileRegistry(profiles),
          stage: "prepared",
          expectedSnapshot: candidate.identity,
        };
        await writeJournal(journal);
      }
      return resumeInternal(journal.operationId, candidate);
    });
  }
  return {
    scan,
    readPending,
    prepare,
    finish,
    importCandidate,
    resume: (operationId: string) =>
      exclusive(() => resumeInternal(operationId)),
    restoreOriginal: (operationId: string) =>
      exclusive(() => restoreOriginal(operationId)),
  };
}
