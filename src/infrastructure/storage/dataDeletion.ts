import {
  assertProfileId,
  decodeProfileRegistry,
  encodeProfileRegistry,
  type DataDeletionRequest,
  type FinanceProfile,
  type LedgerProfile,
} from "../../domain/profiles";

export const DATA_DELETION_KEY = "lad-data-deletion-v1";

type DeletionJournal = {
  version: 1;
  request: DataDeletionRequest;
  catalog: string | null;
  active: FinanceProfile | null;
};

interface DeletionPorts {
  storage: {
    getAllKeys(): Promise<readonly string[]>;
    getItem(key: string): Promise<string | null>;
    setItem(key: string, raw: string): Promise<unknown>;
    removeItem(key: string): Promise<unknown>;
    multiGet(
      keys: string[],
    ): Promise<readonly (readonly [string, string | null])[]>;
    multiRemove(keys: string[]): Promise<unknown>;
  };
  profiles(): Promise<LedgerProfile[]>;
  readActive(): Promise<string | null>;
  writeActive(value: string | null): Promise<unknown>;
  readCatalog(): Promise<string | null>;
  writeCatalog(raw: string | null): Promise<unknown>;
  clearLearning(): Promise<unknown>;
  resetDevice(
    entries: readonly (readonly [string, string | null])[],
    target?: FinanceProfile,
  ): Promise<void>;
}

function decodeJournal(raw: string): DeletionJournal {
  const value = JSON.parse(raw) as DeletionJournal;
  if (!value || value.version !== 1 || !value.request)
    throw new Error("Не удалось прочитать незавершённое удаление данных.");
  if (value.request.type === "all") {
    if (value.catalog !== null || value.active !== null)
      throw new Error("Неверные параметры сброса.");
  } else if (value.request.type === "profile") {
    const target = value.request.profile;
    assertProfileId(target);
    if (typeof value.catalog !== "string")
      throw new Error("Не найден список оставшихся профилей.");
    const profiles = decodeProfileRegistry(value.catalog);
    if (profiles.some((entry) => entry.id === target))
      throw new Error("Удаляемый профиль остался в списке.");
    if (value.active !== null) {
      assertProfileId(value.active);
      if (
        value.active === value.request.profile ||
        (value.active !== "demo" &&
          !profiles.some((p) => p.id === value.active))
      )
        throw new Error("Неверный профиль после удаления.");
    }
  } else throw new Error("Неизвестный вид удаления данных.");
  return value;
}

/** Providers must be unmounted and pending writers drained before calling this. */
export function createDataDeletion(ports: DeletionPorts) {
  const { storage } = ports;
  let running: Promise<void> | undefined;
  let confirmed: DeletionJournal | undefined;

  async function apply(journal: DeletionJournal) {
    const target =
      journal.request.type === "profile" ? journal.request.profile : undefined;
    const selected = (key: string) =>
      key !== DATA_DELETION_KEY &&
      (target
        ? key.startsWith(`lad-profile-${target}:`)
        : key.startsWith("lad-"));
    const keys = (await storage.getAllKeys()).filter(selected);
    // Keep the journal and key IDs until native keys/files have been removed.
    await ports.resetDevice(await storage.multiGet(keys), target);
    await storage.multiRemove(keys);
    if ((await storage.getAllKeys()).some(selected))
      throw new Error("Не все данные удалось удалить. Повторите удаление.");
    if (target) {
      await ports.writeCatalog(journal.catalog);
      await ports.writeActive(journal.active);
      if (decodeProfileRegistry(journal.catalog!).length === 0)
        await ports.clearLearning();
      if (
        (await ports.readCatalog()) !== journal.catalog ||
        (await ports.readActive()) !== journal.active
      )
        throw new Error("Не удалось сохранить список оставшихся профилей.");
    }
    await storage.removeItem(DATA_DELETION_KEY);
    if ((await storage.getItem(DATA_DELETION_KEY)) !== null)
      throw new Error("Не удалось завершить удаление. Повторите попытку.");
  }

  async function run(request?: DataDeletionRequest) {
    const pending = await storage.getItem(DATA_DELETION_KEY);
    if (pending !== null) {
      confirmed = decodeJournal(pending);
      await apply(confirmed);
      confirmed = undefined;
      return;
    }
    if (confirmed) {
      // A successful journal removal can be followed by a failed readback.
      // Retry the already confirmed intent, not a new request for a now missing
      // profile. Persist it again before repeating any native cleanup.
      const raw = JSON.stringify(confirmed);
      await storage.setItem(DATA_DELETION_KEY, raw);
      if ((await storage.getItem(DATA_DELETION_KEY)) !== raw)
        throw new Error("Не удалось сохранить подтверждение удаления.");
      await apply(confirmed);
      confirmed = undefined;
      return;
    }
    if (!request) return;
    let journal: DeletionJournal = {
      version: 1,
      request,
      catalog: null,
      active: null,
    };
    if (request.type === "profile") {
      assertProfileId(request.profile);
      const profiles = await ports.profiles();
      if (
        request.profile !== "demo" &&
        !profiles.some((p) => p.id === request.profile)
      )
        throw new Error("Профиль не найден. Откройте список заново.");
      const remaining = profiles.filter((p) => p.id !== request.profile);
      const previous = await ports.readActive();
      const active =
        previous !== request.profile &&
        (previous === "demo" || remaining.some((p) => p.id === previous))
          ? (previous as FinanceProfile)
          : (remaining[0]?.id ?? null);
      journal = {
        ...journal,
        catalog: encodeProfileRegistry(remaining),
        active,
      };
    }
    const raw = JSON.stringify(journal);
    decodeJournal(raw);
    // No destructive work until the confirmed intent is durable and readable.
    await storage.setItem(DATA_DELETION_KEY, raw);
    if ((await storage.getItem(DATA_DELETION_KEY)) !== raw)
      throw new Error("Не удалось сохранить подтверждение удаления.");
    confirmed = journal;
    await apply(journal);
    confirmed = undefined;
  }

  return {
    run(request?: DataDeletionRequest): Promise<void> {
      if (running) return running;
      running = run(request).finally(() => {
        running = undefined;
      });
      return running;
    },
  };
}
