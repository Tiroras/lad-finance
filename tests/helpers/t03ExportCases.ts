import { createInitialState } from "../../src/domain/seed";
import type { Transaction } from "../../src/domain/types";
import { readBoundedDocument } from "../../src/infrastructure/files/documentReader";
import {
  createCsvExportReceiptStore,
  csvReceiptTotals,
  updateCsvExportReceipt,
} from "../../src/infrastructure/storage/csvExportReceipts";
import {
  prepareCsvExportBatch,
  verifyCsvExportFile,
} from "../../src/features/data-transfer/lib/csvExportBatch";

const DATE = "2026-10-15",
  AT = "2026-10-15T18:00:00.000Z",
  LATER = "2026-10-15T18:01:00.000Z";
const encode = (value: string) => new TextEncoder().encode(value);
function equal(actual: unknown, expected: unknown, context: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(context);
}
function check(value: unknown, context: string): asserts value {
  if (!value) throw new Error(context);
}
async function rejects(action: () => unknown, pattern: RegExp) {
  try {
    await action();
  } catch (error) {
    check(
      error instanceof Error && pattern.test(error.message),
      `Unexpected failure: ${String(error)}`,
    );
    return;
  }
  throw new Error(`Missing failure ${pattern}`);
}
function batchFixture(count = 2) {
  const state = createInitialState(false, DATE);
  state.accounts[0].openingBalance = 1_000_000;
  state.transactions = Array.from(
    { length: count },
    (_, index): Transaction => ({
      id: `operation-${String(index).padStart(5, "0")}`,
      date: DATE,
      accountId: "card",
      type: "expense",
      amount: 100,
      baseAmount: 100,
      category: "other",
      title: `Синтетическая покупка ${index}`,
    }),
  );
  const input = {
    state,
    profileId: "personal" as const,
    profileName: "Личный",
    today: DATE,
    options: { format: "universal" as const, from: DATE, through: DATE },
  };
  const batch = prepareCsvExportBatch(input, "batch-a", AT);
  return { state, input, batch };
}
function memoryStore() {
  const items = new Map<string, string>();
  const faults = { readback: false };
  let wrote = false;
  const storage = {
    async getItem(key: string) {
      if (faults.readback && wrote) throw new Error("readback unavailable");
      return items.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      items.set(key, value);
      wrote = true;
    },
  };
  return {
    items,
    faults,
    store: createCsvExportReceiptStore(storage, "personal"),
    other: createCsvExportReceiptStore(storage, "demo"),
  };
}

export const t03ExportCases: readonly {
  name: string;
  run(): void | Promise<void>;
}[] = [
  {
    name: "CSV batch fixes exact bytes, profile, dates, filters and names before source edits",
    run() {
      const { state, input, batch } = batchFixture();
      const bytes = batch.parts.map((part) => part.content);
      state.transactions[0].title = "Изменено позже";
      state.accounts[0].name = "Переименовано";
      input.profileName = "Другое имя";
      input.options.through = "2026-10-16";
      equal(
        batch.parts.map((part) => part.content),
        bytes,
        "retry bytes changed",
      );
      equal(batch.profileName, "Личный", "captured profile renamed");
      equal(batch.options.through, DATE, "captured filter changed");
      equal(
        batch.parts[0].name,
        "lad-2026-10-15-batch-a-001-of-001.csv",
        "stable batch filename",
      );
      check(
        Object.isFrozen(batch) &&
          Object.isFrozen(batch.parts) &&
          Object.isFrozen(batch.parts[0]) &&
          Object.isFrozen(batch.receipt.parts[0]),
        "batch must be immutable",
      );
      const next = prepareCsvExportBatch(input, "batch-b", LATER);
      check(
        next.id !== batch.id && next.parts[0].sha256 !== batch.parts[0].sha256,
        "new preparation must capture current source",
      );
      equal(
        batch.receipt.parts[0].preparedAt,
        AT,
        "retry changed preparation date",
      );
    },
  },
  {
    name: "void share completion is unknown; confirming the final CSV part does not confirm the entire set",
    async run() {
      const { batch } = batchFixture(5001);
      const { store } = memoryStore();
      equal(batch.parts.length, 2, "fixture parts");
      await store.prepared(batch.receipt);
      let receipt = await store.update(
        batch.id,
        2,
        { type: "transfer", status: "unknown" },
        LATER,
      );
      equal(
        csvReceiptTotals(receipt),
        { total: 2, userConfirmed: 0, readVerified: 0 },
        "share must not confirm saved/read",
      );
      receipt = await store.update(
        batch.id,
        2,
        { type: "user-confirmed" },
        LATER,
      );
      equal(
        csvReceiptTotals(receipt),
        { total: 2, userConfirmed: 1, readVerified: 0 },
        "last part confirmed all files",
      );
      receipt = await store.update(
        batch.id,
        1,
        { type: "not-confirmed" },
        LATER,
      );
      equal(receipt.parts[0].notConfirmedAt, LATER, "not-yet timestamp");
      equal(
        receipt.parts[0].userConfirmedAt,
        undefined,
        "not-yet falsely confirmed",
      );
      equal(
        receipt.parts[1].preparedAt,
        AT,
        "metadata actions changed prepared time",
      );
    },
  },
  {
    name: "CSV verification matches exact bytes and SHA; readable reformatted/different part files do not confirm",
    async run() {
      const { batch } = batchFixture(5001),
        { store } = memoryStore();
      await store.prepared(batch.receipt);
      const part = batch.parts[0],
        expected = batch.receipt.parts[0];
      await rejects(
        () =>
          verifyCsvExportFile(
            expected,
            encode(part.content.replaceAll("\r\n", "\n")),
            part.content,
          ),
        /другой файл/,
      );
      await rejects(
        () => verifyCsvExportFile(expected, encode(batch.parts[1].content)),
        /другой файл/,
      );
      const fingerprint = verifyCsvExportFile(
        expected,
        encode(part.content),
        part.content,
      );
      const receipt = await store.update(
        batch.id,
        1,
        { type: "read-verified", ...fingerprint },
        LATER,
      );
      equal(
        csvReceiptTotals(receipt),
        { total: 2, userConfirmed: 0, readVerified: 1 },
        "read verification should remain separate",
      );
      const before = await store.read();
      await rejects(
        () =>
          store.update(
            batch.id,
            2,
            { type: "read-verified", ...fingerprint },
            LATER,
          ),
        /другой файл/,
      );
      equal(
        await store.read(),
        before,
        "failed read verification mutated receipts",
      );
    },
  },
  {
    name: "CSV receipt store isolates profiles, rejects stale batch updates and serializes confirmation with read verification",
    async run() {
      const { batch, input } = batchFixture();
      const { store, other, items } = memoryStore();
      await store.prepared(batch.receipt);
      const part = batch.receipt.parts[0];
      await Promise.all([
        store.update(batch.id, 1, { type: "user-confirmed" }, LATER),
        store.update(
          batch.id,
          1,
          {
            type: "read-verified",
            sha256: part.sha256,
            byteLength: part.byteLength,
          },
          LATER,
        ),
      ]);
      equal(
        csvReceiptTotals((await store.read())!),
        { total: 1, userConfirmed: 1, readVerified: 1 },
        "concurrent metadata update lost a confirmation",
      );
      equal(await other.read(), null, "profile metadata leaked");
      const next = prepareCsvExportBatch(input, "batch-next", LATER);
      await store.prepared(next.receipt);
      await rejects(
        () => store.update(batch.id, 1, { type: "user-confirmed" }),
        /набор изменился/,
      );
      equal(
        (await store.read())!.batchId,
        next.id,
        "stale intent changed current set",
      );
      const serialized = [...items.values()].join("");
      check(
        !serialized.includes("Синтетическая покупка") &&
          !serialized.includes("Основная карта") &&
          !serialized.includes("Date,Type"),
        "receipt contains financial contents",
      );
    },
  },
  {
    name: "a new CSV preparation clears past confirmation; uncertain metadata write reports failure without false success",
    async run() {
      const { batch } = batchFixture(),
        { store, faults } = memoryStore();
      const confirmed = updateCsvExportReceipt(
        batch.receipt,
        1,
        { type: "user-confirmed" },
        LATER,
      );
      await store.prepared({ ...confirmed, batchId: "another-batch" });
      equal(
        csvReceiptTotals((await store.read())!),
        { total: 1, userConfirmed: 0, readVerified: 0 },
        "new prep carried prior confirmation",
      );
      faults.readback = true;
      await rejects(() => store.prepared(batch.receipt), /readback/);
      faults.readback = false;
      equal(
        (await store.read())!.batchId,
        batch.id,
        "actual ambiguous metadata commit was lost",
      );
    },
  },
  {
    name: "document size and extension are checked before allocation; mismatched reads reject",
    async run() {
      let reads = 0;
      const read = async () => {
        reads++;
        return new Uint8Array(2);
      };
      for (const size of [2_000_001, Number.NaN, -1, Number.POSITIVE_INFINITY])
        await rejects(
          () =>
            readBoundedDocument(
              { name: "test.csv", size, read },
              ["csv"],
              2_000_000,
            ),
          /не больше/,
        );
      await rejects(
        () =>
          readBoundedDocument(
            { name: "test.json", size: 2, read },
            ["csv"],
            2_000_000,
          ),
        /Выберите файл/,
      );
      equal(reads, 0, "read occurred before bounds/name validation");
      await rejects(
        () =>
          readBoundedDocument(
            { name: "test.csv", size: 3, read },
            ["csv"],
            2_000_000,
          ),
        /не полностью/,
      );
      equal(reads, 1, "mismatched read attempted once");
      const exact = await readBoundedDocument(
        { name: "test.CSV", size: 2, read },
        ["csv"],
        2,
      );
      equal(exact.bytes.length, 2, "exact limit rejected");
    },
  },
];
