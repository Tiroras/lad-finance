import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { assertProfileId, type FinanceProfile } from "../../domain/profiles";
import type { BackupCrypto } from "../crypto/passwordBackup";

export type DraftSlot = "transaction" | "onboarding";
export type DraftPayload = Record<string, unknown>;
export interface DraftLease {
  profileId: FinanceProfile;
  slot: DraftSlot;
  recordId: string;
  generation: string;
  token: string;
}
export interface StoredDraft {
  lease: DraftLease;
  revision: number;
  savedAt: string;
  payload: DraftPayload;
}
export interface DraftReplacement {
  operationId: string;
  before: string | null;
  after: string | null;
}
export interface DraftLoad {
  generation: string;
  blockedBy: string | null;
  replacement: DraftReplacement | null;
  token: string | null;
  draft: StoredDraft | null;
}
export interface DraftStringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}
export interface DraftKeyStorage {
  get(profile: FinanceProfile): Promise<string | null>;
  set(profile: FinanceProfile, raw: string): Promise<unknown>;
  remove(profile: FinanceProfile): Promise<unknown>;
}
export interface DraftStoreDependencies {
  storage: DraftStringStorage;
  profile: FinanceProfile;
  random(length: number): Uint8Array;
  now?: () => string;
  encryption?: {
    keys: DraftKeyStorage;
    cipher: Pick<BackupCrypto, "seal" | "open">;
  };
}

// Two small form slots, never a ledger or an unbounded collection of records.
export const MAX_DRAFT_PAYLOAD_BYTES = 65_536;
const MAX_DOCUMENT_BYTES = 2 * MAX_DRAFT_PAYLOAD_BYTES + 8192;
const MAX_ENVELOPE_CHARS = Math.ceil((MAX_DOCUMENT_BYTES + 28) / 3) * 4 + 256;
const slots: readonly DraftSlot[] = ["transaction", "onboarding"];
const encoder = new TextEncoder();
const tokenValid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const recordValid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
const fingerprintValid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:._-]{1,160}$/.test(value);
const instantValid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const invalid = () =>
  new Error("Черновик повреждён или его формат не поддерживается.");
const stale = () =>
  new Error("Черновик уже изменился. Откройте форму ещё раз.");
const blocked = () =>
  new Error("Черновики временно недоступны до проверки замены учёта.");
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // SyntaxError can include an excerpt containing form fields or key bytes.
    throw invalid();
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
function keysExactly(value: Record<string, unknown>, names: readonly string[]) {
  if (
    Object.keys(value).length !== names.length ||
    names.some((name) => !Object.hasOwn(value, name))
  )
    throw invalid();
}
function checkSlot(slot: unknown): asserts slot is DraftSlot {
  if (!slots.includes(slot as DraftSlot)) throw invalid();
}

/** Copy JSON fields before queueing: later UI mutations must not change a save. */
export function checkedDraftPayload(input: unknown): DraftPayload {
  if (!object(input)) throw invalid();
  let nodes = 0,
    units = 0;
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 2000 || depth > 8) throw invalid();
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw invalid();
      return value;
    }
    if (typeof value === "string") {
      units += value.length;
      if (value.length > 8000 || units > MAX_DRAFT_PAYLOAD_BYTES)
        throw invalid();
      return value;
    }
    if (typeof value !== "object" || !value || seen.has(value)) throw invalid();
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > 200) throw invalid();
      return value.map((entry) => visit(entry, depth + 1));
    }
    if (!object(value) || Object.keys(value).length > 100) throw invalid();
    const result: DraftPayload = {};
    for (const [key, entry] of Object.entries(value)) {
      // Optional undefined form fields are equivalent to absent JSON fields.
      if (entry === undefined) continue;
      if (
        key.length > 80 ||
        /^(?:__proto__|constructor|prototype)$/i.test(key) ||
        /password|passphrase|secret|privatekey|devicekey|attachment/i.test(key)
      )
        throw new Error(
          "Пароли, ключи и вложения не сохраняются в черновиках.",
        );
      units += key.length;
      if (units > MAX_DRAFT_PAYLOAD_BYTES) throw invalid();
      result[key] = visit(entry, depth + 1);
    }
    return result;
  };
  const result = visit(input, 0) as DraftPayload;
  if (encoder.encode(JSON.stringify(result)).length > MAX_DRAFT_PAYLOAD_BYTES)
    throw new Error(
      "Черновик слишком большой. Сократите текст или число частей.",
    );
  return result;
}

interface SlotRecord {
  token: string;
  clearedToken: string | null;
  recordId: string | null;
  revision: number;
  savedAt: string | null;
  payload: DraftPayload | null;
}
interface DraftDocument {
  format: "lad-drafts";
  version: 1;
  profileId: FinanceProfile;
  generation: string;
  transaction: SlotRecord | null;
  onboarding: SlotRecord | null;
  replacement: DraftReplacement | null;
  resolved: { operationId: string; outcome: "committed" | "cancelled" } | null;
}
function checkDocument(value: unknown, profile: FinanceProfile): DraftDocument {
  if (!object(value)) throw invalid();
  keysExactly(value, [
    "format",
    "version",
    "profileId",
    "generation",
    ...slots,
    "replacement",
    "resolved",
  ]);
  if (
    value.format !== "lad-drafts" ||
    value.version !== 1 ||
    value.profileId !== profile ||
    !tokenValid(value.generation)
  )
    throw invalid();
  for (const slot of slots) {
    const entry = value[slot];
    if (entry === null) continue;
    if (!object(entry)) throw invalid();
    keysExactly(entry, [
      "token",
      "clearedToken",
      "recordId",
      "revision",
      "savedAt",
      "payload",
    ]);
    if (
      !tokenValid(entry.token) ||
      (entry.clearedToken !== null && !tokenValid(entry.clearedToken)) ||
      (entry.recordId !== null && !recordValid(entry.recordId)) ||
      !Number.isSafeInteger(entry.revision) ||
      (entry.revision as number) < 0 ||
      (entry.savedAt !== null && !instantValid(entry.savedAt))
    )
      throw invalid();
    if (entry.clearedToken !== null && entry.recordId !== null) throw invalid();
    if (entry.payload !== null) {
      if (
        entry.recordId === null ||
        entry.savedAt === null ||
        entry.revision === 0
      )
        throw invalid();
      entry.payload = checkedDraftPayload(entry.payload);
    } else if (entry.savedAt !== null || entry.revision !== 0) throw invalid();
  }
  if (value.replacement !== null) {
    if (!object(value.replacement)) throw invalid();
    keysExactly(value.replacement, ["operationId", "before", "after"]);
    if (
      !tokenValid(value.replacement.operationId) ||
      (value.replacement.before !== null &&
        !fingerprintValid(value.replacement.before)) ||
      (value.replacement.after !== null &&
        !fingerprintValid(value.replacement.after))
    )
      throw invalid();
  }
  if (value.resolved !== null) {
    if (!object(value.resolved)) throw invalid();
    keysExactly(value.resolved, ["operationId", "outcome"]);
    if (
      !tokenValid(value.resolved.operationId) ||
      !["committed", "cancelled"].includes(value.resolved.outcome as string)
    )
      throw invalid();
  }
  return value as unknown as DraftDocument;
}
function empty(
  profileId: FinanceProfile,
  generation = "initial",
): DraftDocument {
  return {
    format: "lad-drafts",
    version: 1,
    profileId,
    generation,
    transaction: null,
    onboarding: null,
    replacement: null,
    resolved: null,
  };
}
export function draftStorageKey(profile: FinanceProfile) {
  assertProfileId(profile);
  return `lad-profile-${profile}:lad-drafts-v1`;
}
export function draftKeyName(profile: FinanceProfile) {
  assertProfileId(profile);
  return `lad-${profile}-drafts-key-v1`;
}
export function draftKeyService(profile: FinanceProfile) {
  assertProfileId(profile);
  return `app.lad.finance.drafts.${profile}`;
}
function checkedKey(raw: string) {
  if (raw.length > 256) throw invalid();
  const key = parseJson(raw);
  if (!object(key)) throw invalid();
  keysExactly(key, ["version", "id", "secret"]);
  if (
    key.version !== 1 ||
    !tokenValid(key.id) ||
    typeof key.secret !== "string" ||
    !/^[a-f0-9]{64}$/.test(key.secret)
  )
    throw invalid();
  return { id: key.id, secret: hexToBytes(key.secret) };
}
function toBase64(bytes: Uint8Array) {
  let result = "";
  for (let index = 0; index < bytes.length; index += 8192)
    result += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(result);
}

// Every factory sharing one backing store also shares a profile queue. The
// expected generation/token is rechecked *inside* it, including after restart.
const queues = new WeakMap<DraftStringStorage, Map<string, Promise<unknown>>>();
export function createDraftStore(dependencies: DraftStoreDependencies) {
  const { storage, profile, encryption } = dependencies;
  const storageKey = draftStorageKey(profile);
  let queue = queues.get(storage);
  if (!queue) {
    queue = new Map();
    queues.set(storage, queue);
  }
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const next = (queue!.get(storageKey) ?? Promise.resolve())
      .catch(() => {})
      .then(task);
    queue!.set(storageKey, next);
    void next
      .finally(() => {
        if (queue!.get(storageKey) === next) queue!.delete(storageKey);
      })
      .catch(() => {});
    return next;
  };
  const random = (length: number) => {
    const bytes = dependencies.random(length);
    if (!(bytes instanceof Uint8Array) || bytes.length !== length)
      throw invalid();
    return bytes;
  };
  const newToken = () => bytesToHex(random(16));
  const context = (keyId: string) =>
    encoder.encode(`app.lad.finance/drafts/1/${profile}/${keyId}`);
  const keyFor = async (create: boolean) => {
    if (!encryption) throw invalid();
    let raw = await encryption.keys.get(profile);
    if (raw === null) {
      if (!create)
        throw new Error(
          "Ключ черновика недоступен. Сохранённый черновик не изменён.",
        );
      const secret = random(32);
      try {
        raw = JSON.stringify({
          version: 1,
          id: newToken(),
          secret: bytesToHex(secret),
        });
        await encryption.keys.set(profile, raw);
        if ((await encryption.keys.get(profile)) !== raw)
          throw new Error("Не удалось подтвердить ключ черновика.");
      } finally {
        secret.fill(0);
      }
    }
    return checkedKey(raw);
  };
  const decode = async (raw: string): Promise<DraftDocument> => {
    if (raw.length > MAX_ENVELOPE_CHARS) throw invalid();
    let value = parseJson(raw);
    if (encryption) {
      if (!object(value)) throw invalid();
      keysExactly(value, ["format", "version", "keyId", "sealed"]);
      if (
        value.format !== "lad-drafts-aes-gcm" ||
        value.version !== 1 ||
        !tokenValid(value.keyId) ||
        typeof value.sealed !== "string" ||
        value.sealed.length < 40 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          value.sealed,
        )
      )
        throw invalid();
      const sealed = Uint8Array.from(atob(value.sealed), (char) =>
        char.charCodeAt(0),
      );
      if (
        sealed.length < 28 ||
        sealed.length > MAX_DOCUMENT_BYTES + 28 ||
        toBase64(sealed) !== value.sealed
      )
        throw invalid();
      const key = await keyFor(false);
      let plain: Uint8Array | undefined;
      try {
        if (key.id !== value.keyId) throw invalid();
        plain = await encryption.cipher.open(
          sealed,
          key.secret,
          context(key.id),
        );
        if (plain.length > MAX_DOCUMENT_BYTES) throw invalid();
        value = parseJson(
          new TextDecoder("utf-8", { fatal: true }).decode(plain),
        );
      } finally {
        key.secret.fill(0);
        plain?.fill(0);
      }
    } else if (encoder.encode(raw).length > MAX_DOCUMENT_BYTES) throw invalid();
    return checkDocument(value, profile);
  };
  const read = async () => {
    const raw = await storage.getItem(storageKey);
    return { raw, document: raw === null ? empty(profile) : await decode(raw) };
  };
  const write = async (document: DraftDocument, mayCreateKey: boolean) => {
    const checked = checkDocument(document, profile),
      serialized = JSON.stringify(checked);
    const plain = encoder.encode(serialized);
    if (plain.length > MAX_DOCUMENT_BYTES) throw invalid();
    let raw = serialized;
    try {
      if (encryption) {
        const key = await keyFor(mayCreateKey);
        let verified: Uint8Array | undefined;
        try {
          const sealed = await encryption.cipher.seal(
            plain,
            key.secret,
            random(12),
            context(key.id),
          );
          if (sealed.length !== plain.length + 28) throw invalid();
          verified = await encryption.cipher.open(
            sealed,
            key.secret,
            context(key.id),
          );
          if (
            verified.length !== plain.length ||
            verified.some((byte, index) => byte !== plain[index])
          )
            throw invalid();
          raw = JSON.stringify({
            format: "lad-drafts-aes-gcm",
            version: 1,
            keyId: key.id,
            sealed: toBase64(sealed),
          });
        } finally {
          key.secret.fill(0);
          verified?.fill(0);
        }
      }
      await storage.setItem(storageKey, raw);
      if ((await storage.getItem(storageKey)) !== raw)
        throw new Error(
          "Не удалось подтвердить сохранение черновика. Попробуйте ещё раз.",
        );
      if (JSON.stringify(await decode(raw)) !== serialized) throw invalid();
      // Readback is an acknowledgement, not a claim of power-loss durability.
      return checked;
    } finally {
      plain.fill(0);
    }
  };
  const leaseFor = (
    document: DraftDocument,
    slot: DraftSlot,
    entry: SlotRecord,
  ): DraftLease => ({
    profileId: profile,
    slot,
    recordId: entry.recordId!,
    generation: document.generation,
    token: entry.token,
  });
  const stored = (
    document: DraftDocument,
    slot: DraftSlot,
  ): StoredDraft | null => {
    const entry = document[slot];
    return entry?.payload
      ? {
          lease: leaseFor(document, slot, entry),
          revision: entry.revision,
          savedAt: entry.savedAt!,
          payload: entry.payload,
        }
      : null;
  };
  const assertLease = (document: DraftDocument, lease: DraftLease) => {
    checkSlot(lease.slot);
    if (document.replacement) throw blocked();
    const entry = document[lease.slot];
    if (
      lease.profileId !== profile ||
      lease.generation !== document.generation ||
      !entry ||
      lease.token !== entry.token ||
      lease.recordId !== entry.recordId
    )
      throw stale();
    return entry;
  };
  const resolve = async (
    document: DraftDocument,
    operationId: string,
    outcome: "committed" | "cancelled",
  ) => {
    if (document.replacement?.operationId !== operationId) {
      if (
        document.resolved?.operationId === operationId &&
        document.resolved.outcome === outcome
      )
        return;
      throw stale();
    }
    await write(
      {
        ...(outcome === "committed" ? empty(profile) : document),
        generation: newToken(),
        replacement: null,
        resolved: { operationId, outcome },
      },
      false,
    );
  };
  return {
    load: (slot: DraftSlot): Promise<DraftLoad> =>
      exclusive(async () => {
        checkSlot(slot);
        const { document } = await read();
        return {
          generation: document.generation,
          blockedBy: document.replacement?.operationId ?? null,
          replacement: document.replacement,
          token: document[slot]?.token ?? null,
          draft: document.replacement ? null : stored(document, slot),
        };
      }),
    claim: (
      identity: { slot: DraftSlot; recordId: string },
      expected: { generation: string; token: string | null },
    ): Promise<DraftLease> => {
      const { slot, recordId } = identity,
        { generation, token } = expected;
      return exclusive(async () => {
        checkSlot(slot);
        if (!recordValid(recordId)) throw invalid();
        const { document, raw } = await read();
        if (document.replacement) throw blocked();
        if (
          generation !== document.generation ||
          token !== (document[slot]?.token ?? null)
        )
          throw stale();
        const previous = document[slot];
        const entry: SlotRecord =
          previous?.recordId === recordId
            ? { ...previous, token: newToken() }
            : {
                token: newToken(),
                clearedToken: null,
                recordId,
                revision: 0,
                savedAt: null,
                payload: null,
              };
        await write({ ...document, [slot]: entry }, raw === null);
        return leaseFor(document, slot, entry);
      });
    },
    save: (lease: DraftLease, payload: unknown): Promise<StoredDraft> => {
      const owner = { ...lease };
      // Validate synchronously into a private copy, but expose rejection as Promise.
      let copy: DraftPayload;
      try {
        copy = checkedDraftPayload(payload);
      } catch (failure) {
        return Promise.reject(failure);
      }
      return exclusive(async () => {
        const { document } = await read(),
          entry = assertLease(document, owner);
        const savedAt = (
          dependencies.now ?? (() => new Date().toISOString())
        )();
        const next: SlotRecord = {
          ...entry,
          payload: copy,
          savedAt,
          revision: entry.revision + 1,
        };
        const confirmed = await write(
          { ...document, [owner.slot]: next },
          false,
        );
        return stored(confirmed, owner.slot)!;
      });
    },
    clear: (lease: DraftLease): Promise<void> => {
      const owner = { ...lease };
      return exclusive(async () => {
        const { document } = await read();
        checkSlot(owner.slot);
        const entry = document[owner.slot];
        // A readback error can follow a successful clear. Retry acknowledges
        // only this exact tombstone, never a later owner's empty/new draft.
        if (
          owner.profileId === profile &&
          document.generation === owner.generation &&
          !document.replacement &&
          entry?.recordId === null &&
          entry.clearedToken === owner.token
        )
          return;
        assertLease(document, owner);
        await write(
          {
            ...document,
            [owner.slot]: {
              token: newToken(),
              clearedToken: owner.token,
              recordId: null,
              revision: 0,
              savedAt: null,
              payload: null,
            },
          },
          false,
        );
      });
    },
    clearProfile: (): Promise<void> =>
      exclusive(async () => {
        const { raw } = await read();
        await write(empty(profile, newToken()), raw === null);
      }),
    beginReplacement: (
      operationId: string,
      evidence?: { before: string | null; after: string },
    ): Promise<void> => {
      const replacement: DraftReplacement = {
        operationId,
        before: evidence?.before ?? null,
        after: evidence?.after ?? null,
      };
      return exclusive(async () => {
        const { document, raw } = await read();
        if (!tokenValid(operationId)) throw invalid();
        if (document.replacement) {
          if (
            JSON.stringify(document.replacement) === JSON.stringify(replacement)
          )
            return;
          throw blocked();
        }
        await write(
          { ...document, generation: newToken(), replacement, resolved: null },
          raw === null,
        );
      });
    },
    finishReplacement: (operationId: string): Promise<void> =>
      exclusive(async () => {
        const { document } = await read();
        await resolve(document, operationId, "committed");
      }),
    cancelReplacement: (operationId: string): Promise<void> =>
      exclusive(async () => {
        const { document } = await read();
        await resolve(document, operationId, "cancelled");
      }),
    resolveReplacement: (
      fingerprint: string | null,
    ): Promise<"none" | "committed" | "cancelled" | "blocked"> =>
      exclusive(async () => {
        const { document } = await read(),
          replacement = document.replacement;
        if (!replacement) return "none";
        const outcome =
          fingerprint !== null && fingerprint === replacement.after
            ? "committed"
            : fingerprint !== null && fingerprint === replacement.before
              ? "cancelled"
              : null;
        if (!outcome) return "blocked";
        await resolve(document, replacement.operationId, outcome);
        return outcome;
      }),
    purgeProfile: (): Promise<void> =>
      exclusive(async () => {
        // Explicit destructive purge also works when the document/key is corrupt.
        await storage.removeItem(storageKey);
        if ((await storage.getItem(storageKey)) !== null)
          throw new Error("Не удалось удалить черновики профиля.");
        if (encryption) {
          await encryption.keys.remove(profile);
          if ((await encryption.keys.get(profile)) !== null)
            throw new Error("Не удалось удалить ключ черновиков.");
        }
      }),
  };
}
export type DraftStorage = ReturnType<typeof createDraftStore>;
