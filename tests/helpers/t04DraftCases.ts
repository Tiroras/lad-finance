import type { FinanceProfile } from "../../src/domain/profiles";
import { backupCrypto } from "../../src/infrastructure/crypto/backupCrypto";
import {
  checkedDraftPayload,
  createDraftStore,
  draftStorageKey,
  MAX_DRAFT_PAYLOAD_BYTES,
  type DraftKeyStorage,
  type DraftStringStorage,
} from "../../src/infrastructure/storage/draftStore";

const AT = "2026-10-06T12:00:00.000Z";
const payload = () => ({
  version: 1,
  createId: "stable-transaction-id",
  quick: "Кофе 3,",
  draft: {
    type: "expense",
    title: "Синтетическая покупка",
    amount: "3,",
    date: "2026-10-06",
    note: "Незаконченный ввод\n🚀",
    parts: [{ key: "first", amount: "", category: "other" }],
  },
});
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(message);
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(action: () => unknown, pattern?: RegExp) {
  try {
    await action();
  } catch (failure) {
    check(
      failure instanceof Error && (!pattern || pattern.test(failure.message)),
      "Unexpected rejection",
    );
    return;
  }
  throw new Error("Expected rejection");
}
function fixture(encrypted = false) {
  const metadata = new Map<string, string>(),
    secrets = new Map<FinanceProfile, string>();
  const writes: string[] = [],
    keyWrites: string[] = [];
  const fault = {
    write: false,
    readback: false,
    keyRead: false,
    keyWrite: false,
    keyReadback: false,
    remove: false,
  };
  let pendingReadback = false,
    pendingKeyReadback = false;
  const storage: DraftStringStorage = {
    async getItem(key) {
      if (pendingReadback) {
        pendingReadback = false;
        throw new Error("readback unavailable");
      }
      return metadata.get(key) ?? null;
    },
    async setItem(key, value) {
      if (fault.write) throw new Error("write unavailable");
      metadata.set(key, value);
      writes.push(value);
      if (fault.readback) pendingReadback = true;
    },
    async removeItem(key) {
      if (fault.remove) throw new Error("remove unavailable");
      metadata.delete(key);
    },
  };
  const keys: DraftKeyStorage = {
    async get(profile) {
      if (fault.keyRead || pendingKeyReadback) {
        pendingKeyReadback = false;
        throw new Error("key unavailable");
      }
      return secrets.get(profile) ?? null;
    },
    async set(profile, value) {
      if (fault.keyWrite) throw new Error("key write unavailable");
      secrets.set(profile, value);
      keyWrites.push(value);
      if (fault.keyReadback) pendingKeyReadback = true;
    },
    async remove(profile) {
      secrets.delete(profile);
    },
  };
  const factory = (profile: FinanceProfile = "personal") =>
    createDraftStore({
      profile,
      storage,
      random: backupCrypto.random,
      now: () => AT,
      ...(encrypted ? { encryption: { keys, cipher: backupCrypto } } : {}),
    });
  return { metadata, secrets, writes, keyWrites, fault, factory, storage };
}
async function create(f: ReturnType<typeof fixture>, recordId = "new") {
  const store = f.factory(),
    loaded = await store.load("transaction");
  const lease = await store.claim({ slot: "transaction", recordId }, loaded);
  return { store, lease };
}

export const t04DraftCases: readonly {
  name: string;
  run(): void | Promise<void>;
}[] = [
  {
    name: "draft reads are readonly and preserve incomplete raw fields/date across a new reader without TTL",
    async run() {
      const f = fixture(),
        store = f.factory();
      equal((await store.load("transaction")).draft, null, "empty load");
      equal(f.writes.length, 0, "opening generated a draft");
      const lease = await store.claim(
        { slot: "transaction", recordId: "new" },
        await store.load("transaction"),
      );
      const original = payload(),
        saving = store.save(lease, original);
      original.draft.note = "Поздняя мутация исходного объекта";
      const saved = await saving;
      equal(
        saved.payload,
        payload(),
        "queued save did not capture immutable fields",
      );
      const count = f.writes.length,
        loaded = await f.factory().load("transaction");
      equal(loaded.draft?.payload, payload(), "new reader changed draft/date");
      equal(loaded.draft?.savedAt, AT, "receipt date");
      equal(f.writes.length, count, "load mutated metadata");
      check(
        f.writes.at(-1)!.includes("Синтетическая покупка"),
        "web must explicitly remain plaintext",
      );
    },
  },
  {
    name: "native protocol encrypts both slots with one separate key and fresh GCM nonce; browser AES verifies the protocol",
    async run() {
      const f = fixture(true),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      const before = f.writes.at(-1)!;
      await store.save(lease, payload());
      check(f.writes.at(-1) !== before, "nonce reused for repeated payload");
      equal(f.keyWrites.length, 1, "one profile must reuse its own fixed key");
      for (const raw of f.writes) {
        const envelope = JSON.parse(raw);
        equal(
          Object.keys(envelope).sort(),
          ["format", "keyId", "sealed", "version"],
          "extra plaintext envelope fields",
        );
        check(
          !raw.includes("Синтетическая") &&
            !raw.includes("stable-transaction-id") &&
            !raw.includes("amount"),
          "draft plaintext leaked",
        );
      }
      equal(
        (await f.factory().load("transaction")).draft?.payload,
        payload(),
        "encrypted restart roundtrip",
      );
      const onboarding = await store.claim(
        { slot: "onboarding", recordId: "initial" },
        await store.load("onboarding"),
      );
      await store.save(onboarding, {
        version: 1,
        name: "Синтетика",
        step: 2,
        balance: "1,",
      });
      equal(f.keyWrites.length, 1, "slot created another key");
      equal(
        (await store.load("transaction")).draft?.payload,
        payload(),
        "onboarding overwrote transaction",
      );
    },
  },
  {
    name: "all factories serialize one profile, preserve other slots and isolate other profiles",
    async run() {
      const f = fixture(),
        { store, lease } = await create(f);
      const otherSlot = f.factory();
      const onboarding = await otherSlot.claim(
        { slot: "onboarding", recordId: "setup" },
        await otherSlot.load("onboarding"),
      );
      await Promise.all([
        store.save(lease, payload()),
        otherSlot.save(onboarding, { name: "Синтетика", step: 3 }),
      ]);
      equal(
        (await store.load("transaction")).draft?.payload,
        payload(),
        "lost transaction update",
      );
      equal(
        (await store.load("onboarding")).draft?.payload,
        { name: "Синтетика", step: 3 },
        "lost onboarding update",
      );
      equal(
        (await f.factory("demo").load("transaction")).draft,
        null,
        "profile leak",
      );
      await rejects(
        () => f.factory("demo").save(lease, payload()),
        /изменился/,
      );
    },
  },
  {
    name: "discard tombstone invalidates queued and late saves; an old owner cannot overwrite or clear a newer record",
    async run() {
      const f = fixture(),
        { store, lease } = await create(f);
      const first = store.save(lease, payload()),
        clearing = store.clear(lease),
        late = store.save(lease, payload());
      await first;
      await clearing;
      await rejects(() => late, /изменился/);
      equal(
        (await f.factory().load("transaction")).draft,
        null,
        "clear resurrected",
      );
      const observed = await store.load("transaction");
      const next = await store.claim(
        { slot: "transaction", recordId: "another" },
        observed,
      );
      await store.save(next, { title: "Новый черновик" });
      await rejects(() => store.clear(lease), /изменился/);
      await rejects(() => store.save(lease, payload()), /изменился/);
      equal(
        (await store.load("transaction")).draft?.payload,
        { title: "Новый черновик" },
        "old owner changed new record",
      );
      await rejects(
        () => store.claim({ slot: "transaction", recordId: "third" }, observed),
        /изменился/,
      );
    },
  },
  {
    name: "reclaiming a restored record retains its fields and invalidates the old form owner",
    async run() {
      const f = fixture(),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      const loaded = await f.factory().load("transaction");
      const next = await store.claim(
        { slot: "transaction", recordId: "new" },
        loaded,
      );
      check(next.token !== lease.token, "restore ownership token unchanged");
      equal(
        (await store.load("transaction")).draft?.payload,
        payload(),
        "claim erased restored data",
      );
      await rejects(() => store.clear(lease), /изменился/);
      await store.clear(next);
      equal(
        (await store.load("transaction")).draft,
        null,
        "restored owner cannot discard",
      );
    },
  },
  {
    name: "replacement barrier survives a new reader; unknown ledger never exposes old fields and confirmed replacement clears them",
    async run() {
      const f = fixture(true),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      await store.beginReplacement("replace-1", {
        before: "sha-before",
        after: "sha-after",
      });
      const restarted = f.factory(),
        loaded = await restarted.load("transaction");
      equal(loaded.blockedBy, "replace-1", "replacement barrier lost");
      equal(loaded.draft, null, "old draft exposed across replacement");
      equal(
        await restarted.resolveReplacement(null),
        "blocked",
        "unknown state unblocked drafts",
      );
      equal(
        await restarted.resolveReplacement("sha-third"),
        "blocked",
        "third ledger unblocked drafts",
      );
      await rejects(() => restarted.save(lease, payload()), /недоступны/);
      equal(
        await restarted.resolveReplacement("sha-after"),
        "committed",
        "committed ledger not resolved",
      );
      await restarted.finishReplacement("replace-1");
      equal(
        (await restarted.load("transaction")).draft,
        null,
        "confirmed replacement retained old draft",
      );
      await rejects(() => restarted.save(lease, payload()), /изменился/);
    },
  },
  {
    name: "proven unchanged ledger restores old fields with a new generation; explicit clear removes an unresolved barrier",
    async run() {
      const f = fixture(),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      await store.beginReplacement("failed-replace", {
        before: "old",
        after: "new",
      });
      equal(
        await f.factory().resolveReplacement("old"),
        "cancelled",
        "unchanged ledger not resolved",
      );
      const retained = await store.load("transaction");
      equal(
        retained.draft?.payload,
        payload(),
        "cancelled replacement erased draft",
      );
      check(
        retained.generation !== lease.generation,
        "old session remains valid after replacement attempt",
      );
      await rejects(() => store.save(lease, payload()), /изменился/);
      await store.beginReplacement("unknown-replace");
      await store.clearProfile();
      equal(
        (await store.load("transaction")).blockedBy,
        null,
        "explicit clear remained blocked",
      );
      equal(
        (await store.load("transaction")).draft,
        null,
        "explicit clear retained old data",
      );
    },
  },
  {
    name: "write and ambiguous readback failures never acknowledge a draft; confirmed old or new data remain readable",
    async run() {
      const f = fixture(true),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      f.fault.write = true;
      await rejects(
        () => store.save(lease, { title: "Запись не прошла" }),
        /write unavailable/,
      );
      f.fault.write = false;
      equal(
        (await store.load("transaction")).draft?.payload,
        payload(),
        "precommit failure lost old fields",
      );
      f.fault.readback = true;
      await rejects(
        () => store.save(lease, { title: "Исход записи неизвестен" }),
        /readback unavailable/,
      );
      f.fault.readback = false;
      equal(
        (await f.factory().load("transaction")).draft?.payload,
        { title: "Исход записи неизвестен" },
        "ambiguous commit incorrectly rolled back",
      );
      await store.save(lease, payload());
      equal(
        (await store.load("transaction")).draft?.payload,
        payload(),
        "retry failed",
      );
      f.fault.readback = true;
      await rejects(() => store.clear(lease), /readback unavailable/);
      f.fault.readback = false;
      await store.clear(lease);
      equal(
        (await store.load("transaction")).draft,
        null,
        "uncertain clear retry resurrected data",
      );
    },
  },
  {
    name: "missing or unreadable native key does not regenerate a key or fall back to plaintext over ciphertext",
    async run() {
      const f = fixture(true),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      const raw = f.metadata.get(draftStorageKey("personal"))!,
        writes = f.keyWrites.length;
      f.secrets.clear();
      await rejects(() => f.factory().load("transaction"), /Ключ черновика/);
      await rejects(() => store.save(lease, payload()), /Ключ черновика/);
      equal(f.keyWrites.length, writes, "missing key silently regenerated");
      equal(
        f.metadata.get(draftStorageKey("personal")),
        raw,
        "ciphertext replaced on key failure",
      );
      const empty = fixture(true);
      empty.fault.keyReadback = true;
      await rejects(() => create(empty), /key unavailable/);
      equal(empty.writes.length, 0, "unconfirmed key published a draft");
      empty.fault.keyReadback = false;
      await create(empty);
      equal(empty.keyWrites.length, 1, "orphan fixed key not reused");
    },
  },
  {
    name: "ciphertext corruption, cross-profile substitution and plaintext substitution fail closed",
    async run() {
      const f = fixture(true),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      const key = draftStorageKey("personal"),
        raw = f.metadata.get(key)!;
      const envelope = JSON.parse(raw),
        bytes = Uint8Array.from(atob(envelope.sealed), (x) => x.charCodeAt(0));
      bytes[bytes.length - 1] ^= 1;
      let chars = "";
      for (const byte of bytes) chars += String.fromCharCode(byte);
      f.metadata.set(key, JSON.stringify({ ...envelope, sealed: btoa(chars) }));
      await rejects(() => store.load("transaction"));
      f.metadata.set(key, raw);
      // Even with the same test key copied, AAD must bind ciphertext to profile.
      f.secrets.set("demo", f.secrets.get("personal")!);
      f.metadata.set(draftStorageKey("demo"), raw);
      await rejects(() => f.factory("demo").load("transaction"));
      f.metadata.set(key, JSON.stringify({ title: "Открытый текст" }));
      await rejects(() => store.load("transaction"));
      equal(f.writes.at(-1), raw, "read failure mutated storage");
    },
  },
  {
    name: "payload bounds are checked before writing; incomplete fields accepted, secrets and large/deep/non-JSON inputs rejected",
    async run() {
      const f = fixture(),
        { store, lease } = await create(f),
        before = f.writes.length;
      const oversized = Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [
          `field${index}`,
          "я".repeat(4000),
        ]),
      );
      check(
        new TextEncoder().encode(JSON.stringify(oversized)).length >
          MAX_DRAFT_PAYLOAD_BYTES,
        "oversize fixture",
      );
      for (const bad of [
        oversized,
        { password: "synthetic-only" },
        { nested: { attachment: "fake" } },
        { value: "x".repeat(8001) },
        { list: Array(201).fill(0) },
        { value: Number.NaN },
        { value: new Date(AT) },
      ])
        await rejects(() => store.save(lease, bad));
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      await rejects(() => store.save(lease, circular));
      equal(f.writes.length, before, "invalid payload reached storage");
      equal(
        checkedDraftPayload({
          amount: "",
          date: "2026-",
          received: null,
          optional: undefined,
        }),
        { amount: "", date: "2026-", received: null },
        "raw partial input rejected or normalized",
      );
      f.metadata.set(
        draftStorageKey("personal"),
        "not json synthetic-sensitive-field",
      );
      try {
        await store.load("transaction");
      } catch (failure) {
        check(
          failure instanceof Error &&
            !failure.message.includes("sensitive-field"),
          "parse error disclosed content",
        );
      }
    },
  },
  {
    name: "purge verifies metadata removal before deleting the separate draft key and never touches other profile data",
    async run() {
      const f = fixture(true),
        { store, lease } = await create(f);
      await store.save(lease, payload());
      f.metadata.set(
        "lad-profile-personal:lad-finance-encrypted-v1",
        "financial envelope untouched",
      );
      f.secrets.set("demo", "other profile key");
      f.fault.remove = true;
      await rejects(() => store.purgeProfile(), /remove unavailable/);
      check(
        f.secrets.has("personal"),
        "failed metadata purge deleted decrypting key",
      );
      f.fault.remove = false;
      // Explicit purge remains available for corrupt, unreadable draft bytes.
      f.metadata.set(draftStorageKey("personal"), "corrupt");
      await store.purgeProfile();
      equal(f.secrets.has("personal"), false, "draft key retained");
      equal(f.secrets.get("demo"), "other profile key", "other key erased");
      equal(
        f.metadata.get("lad-profile-personal:lad-finance-encrypted-v1"),
        "financial envelope untouched",
        "ledger touched",
      );
      await rejects(() => store.save(lease, payload()), /изменился/);
      equal(
        (await f.factory().load("transaction")).draft,
        null,
        "purged draft resurrected",
      );
    },
  },
];
