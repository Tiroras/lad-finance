import { encodeBackup } from "../../src/domain/backup";
import { prepareRestoreCandidate } from "../../src/domain/backupRecovery";
import {
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  guessCsvMapping,
  parseCsv,
  previewCsv,
  type CsvOptions,
} from "../../src/domain/csv";
import {
  exportTransactionsCsv,
  exportTransactionsCsvParts,
} from "../../src/domain/csvExport";
import {
  applyCsvImportWithSummary,
  restoreFinanceWithSummary,
} from "../../src/domain/actions/dataTransfer";
import {
  buildFinanceSnapshotSummary,
  buildReplacementImportSummary,
} from "../../src/domain/dataTransfer";
import { createInitialState } from "../../src/domain/seed";
import type { FinanceState, Transaction } from "../../src/domain/types";

const TODAY = "2026-10-15";
const format = { format: "universal" } as const;
const bytes = (text: string) => new TextEncoder().encode(text).length;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual),
    expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson)
    throw new Error(
      `${message}: expected ${expectedJson?.slice(0, 300)}, got ${actualJson?.slice(0, 300)}`,
    );
}
function rejects(action: () => unknown, pattern: RegExp) {
  try {
    action();
  } catch (error) {
    check(
      error instanceof Error && pattern.test(error.message),
      `Unexpected rejection: ${String(error)}`,
    );
    return;
  }
  throw new Error(`Expected rejection ${pattern}`);
}
function transaction(index: number): Transaction {
  return {
    id: `entry-${String(index).padStart(6, "0")}`,
    type: "expense",
    title: `Покупка ${index}`,
    date: TODAY,
    amount: 100,
    baseAmount: 100,
    accountId: "card",
    category: "other",
  };
}
function ledger(count = 0) {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 10_000_000;
  state.transactions = Array.from({ length: count }, (_, index) =>
    transaction(index),
  );
  return state;
}

export function createT03LargeExportFixture() {
  const state = ledger(20_000);
  for (let index = 0; index < 4_000; index++)
    state.transactions[index].splits = [
      { category: state.categories[0].id, amount: 60 },
      { category: state.categories[1].id, amount: 40 },
    ];
  return state;
}
function options(headers: string[]): CsvOptions {
  return {
    accountId: "card",
    mapping: guessCsvMapping(headers),
    mode: "signed",
    positive: "income",
    dateOrder: "dmy",
  };
}
function verified(state: FinanceState, rescue = false) {
  return prepareRestoreCandidate(encodeBackup(state), {
    normalizationDate: TODAY,
    normalizationVersion: 1,
    targetDemo: false,
    transportMode: rescue ? "rescue" : "standard",
  });
}

/** The same scenarios run inside Chromium and, when authorized, via node:test. */
export const t03CsvCases: readonly { name: string; run(): void }[] = [
  {
    name: "20,000 operations produce 24,000 rows in importable parts with intact split groups",
    run() {
      const state = createT03LargeExportFixture();
      const before = encodeBackup(state);
      const result = exportTransactionsCsvParts(state, format, TODAY);
      equal(result.totals.transactionCount, 20_000, "source transactions");
      equal(result.totals.rowCount, 24_000, "result rows");
      equal(result.parts.length, 5, "result files");
      const transactionParts = new Map<string, number>();
      let rows = 0;
      result.parts.forEach((part, partIndex) => {
        const table = parseCsv(part.content);
        check(
          part.rowCount <= CSV_MAX_ROWS && part.byteLength <= CSV_MAX_BYTES,
          "part exceeds import cap",
        );
        equal(bytes(part.content), part.byteLength, "UTF-8 bytes");
        equal(table.rows.length, part.rowCount, "logical rows");
        for (const row of table.rows) {
          const id = row[15] || row[9];
          const previous = transactionParts.get(id);
          check(
            previous === undefined || previous === partIndex,
            "split crossed file boundary",
          );
          transactionParts.set(id, partIndex);
        }
        rows += part.rowCount;
      });
      equal(rows, 24_000, "rows preserved");
      equal(transactionParts.size, 20_000, "identities preserved");
      equal(encodeBackup(state), before, "export mutated source");
      state.transactions.reverse();
      equal(
        exportTransactionsCsvParts(state, format, TODAY),
        result,
        "date/ID order must be deterministic",
      );
    },
  },
  {
    name: "exact 5000-row boundary never divides a purchase or split refund",
    run() {
      const state = ledger(4_999);
      const purchase = transaction(5_000);
      purchase.amount = 1000;
      purchase.baseAmount = 1000;
      purchase.splits = [
        { category: state.categories[0].id, amount: 600 },
        { category: state.categories[1].id, amount: 400 },
      ];
      state.transactions.push(purchase, {
        ...transaction(5_001),
        type: "income",
        amount: 500,
        baseAmount: 500,
        refundOf: purchase.id,
      });
      const result = exportTransactionsCsvParts(state, format, TODAY);
      equal(
        result.parts.map((part) => part.rowCount),
        [4999, 4],
        "group boundary",
      );
      const rows = parseCsv(result.parts[1].content).rows;
      equal(
        rows.map((row) => row[15]),
        [purchase.id, purchase.id, "entry-005001", "entry-005001"],
        "group IDs",
      );
      equal(
        rows.slice(2).map((row) => row[16]),
        [purchase.id, purchase.id],
        "refund references",
      );
      equal(
        rows.slice(2).map((row) => row[2]),
        ["3.00", "2.00"],
        "refund allocations",
      );
      const exact = exportTransactionsCsvParts(ledger(5000), format, TODAY);
      equal(
        exact.parts.map((part) => part.rowCount),
        [5000],
        "exact row cap",
      );
    },
  },
  {
    name: "exact 2MB includes BOM, header and CRLF; one extra byte starts another part",
    run() {
      const state = ledger(1000);
      const remaining =
        CSV_MAX_BYTES -
        bytes(exportTransactionsCsv(state, format, TODAY).content);
      const common = Math.floor(remaining / state.transactions.length);
      check(
        common > 0 && common < 2000,
        "boundary fixture must respect cell cap",
      );
      state.transactions.forEach((entry, index) => {
        entry.note = "a".repeat(
          common + (index < remaining % state.transactions.length ? 1 : 0),
        );
      });
      equal(
        bytes(exportTransactionsCsv(state, format, TODAY).content),
        CSV_MAX_BYTES,
        "independent single-file boundary",
      );
      let result = exportTransactionsCsvParts(state, format, TODAY);
      equal(result.parts.length, 1, "exact byte cap");
      equal(result.parts[0].byteLength, CSV_MAX_BYTES, "exact bytes");
      equal(
        parseCsv(result.parts[0].content).rows.length,
        1000,
        "boundary parse",
      );
      state.transactions[0].note += "a";
      result = exportTransactionsCsvParts(state, format, TODAY);
      equal(result.parts.length, 2, "one byte above limit");
      equal(result.totals.transactionCount, 1000, "no truncation");
      result.parts.forEach((part) => {
        check(part.byteLength <= CSV_MAX_BYTES, "byte overflow");
        equal(parseCsv(part.content).rows.length, part.rowCount, "part parses");
      });
    },
  },
  {
    name: "Unicode, quoted multiline fields and spreadsheet text escapes remain logical CSV cells",
    run() {
      const state = ledger(3);
      state.transactions[0].title = '=Формула, "кавычки"';
      state.transactions[0].note = 'Первая строка 😀\r\nВторая, "цитата"';
      state.transactions[1].title = "𐐀漢字Кириллица";
      state.transactions[2].note = "К".repeat(1800);
      const result = exportTransactionsCsvParts(state, format, TODAY);
      const table = parseCsv(result.parts[0].content);
      equal(table.rows.length, 3, "embedded newlines are not records");
      equal(table.rows[0][4], '\'=Формула, "кавычки"', "formula protection");
      equal(table.rows[0][8], state.transactions[0].note, "multiline content");
      equal(table.rows[1][4], state.transactions[1].title, "non-BMP content");
      equal(
        result.parts[0].byteLength,
        bytes(result.parts[0].content),
        "Unicode UTF-8 length",
      );
      check(
        result.parts[0].byteLength > result.parts[0].content.length,
        "must measure UTF-8, not UTF-16",
      );
      equal(
        result.parts[0].content,
        exportTransactionsCsv(state, format, TODAY).content,
        "single part compatibility",
      );
    },
  },
  {
    name: "oversized indivisible groups and unsupported cells reject the whole export",
    run() {
      const state = ledger(2);
      // Deliberately hostile internal input: even a group larger than the
      // financial schema permits must never be silently split/truncated.
      state.transactions[1].splits = Array.from({ length: 5001 }, () => ({
        category: "other",
        amount: 1,
      }));
      rejects(
        () => exportTransactionsCsvParts(state, format, TODAY),
        /Операция не помещается/,
      );
      delete state.transactions[1].splits;
      for (const note of [
        "a".repeat(2001),
        "\0",
        "\uFFFD",
        "\uD800",
        "=" + "a".repeat(1999),
      ]) {
        state.transactions[1].note = note;
        rejects(
          () => exportTransactionsCsvParts(state, format, TODAY),
          /ячее[кй]/,
        );
      }
      state.transactions[1].note = "a".repeat(2000);
      equal(
        parseCsv(
          exportTransactionsCsvParts(state, format, TODAY).parts[0].content,
        ).rows[1][8].length,
        2000,
        "exact decoded cell limit",
      );
    },
  },
  {
    name: "universal currency transfers remain one row with both exact amounts and account-filter sign",
    run() {
      const state = ledger();
      state.accounts.find((account) => account.id === "savings")!.currency =
        "JPY";
      state.transactions = [
        {
          ...transaction(0),
          type: "transfer",
          title: "Обмен",
          amount: 12345,
          toAmount: 200,
          toAccountId: "savings",
        },
      ];
      const result = exportTransactionsCsvParts(
        state,
        { ...format, accountId: "savings" },
        TODAY,
      );
      const row = parseCsv(result.parts[0].content).rows[0];
      equal(result.totals.rowCount, 1, "transfer is one row");
      equal(row.slice(2, 4), ["200", "JPY"], "receiving account view");
      equal(
        row.slice(10, 14),
        ["123.45", "RUB", "200", "JPY"],
        "both transfer amounts",
      );
      const ynab = exportTransactionsCsvParts(
        state,
        { format: "ynab", accountId: "savings" },
        TODAY,
      );
      equal(
        parseCsv(ynab.parts[0].content).rows[0].slice(3),
        ["", "200"],
        "YNAB receiving view",
      );
      equal(
        exportTransactionsCsvParts(
          state,
          { ...format, through: "2026-10-14" },
          TODAY,
        ).totals.period,
        { from: null, through: null },
        "empty period",
      );
    },
  },
  {
    name: "CSV result revalidates latest state and partitions invalid, duplicate, excluded and added logical rows",
    run() {
      const state = ledger();
      state.accounts[0].openingBalance = 100000;
      const initialTable = parseCsv(
        "Date;Description;Amount;ID\n2026-10-15;Old;-10;old",
      );
      const first = applyCsvImportWithSummary(
        state,
        {
          table: initialTable,
          options: options(initialTable.headers),
          excluded: new Set(),
          overrides: {},
        },
        TODAY,
      );
      const table = parseCsv(
        'Date;Description;Amount;ID\n2026-10-15;Old;-10;old\n2026-10-16;Future;99;future\n2026-10-15;Excluded;100;excluded\n2026-10-15;"Two\nlines";-20;new\n2026-10-15;Income;50;income',
      );
      const stalePreview = previewCsv(
        state,
        table,
        options(table.headers),
        {},
        TODAY,
      );
      check(!stalePreview[0].duplicate, "fixture must have stale preview");
      const before = encodeBackup(first.state);
      const result = applyCsvImportWithSummary(
        first.state,
        {
          table,
          options: options(table.headers),
          excluded: new Set([2, 3, 4]),
          overrides: {},
        },
        TODAY,
      );
      equal(
        result.summary.csv,
        {
          sourceRows: 5,
          added: 2,
          skipped: { invalid: 1, duplicate: 1, excluded: 1 },
        },
        "exclusive row outcomes",
      );
      equal(
        result.summary.before?.counts.transactions,
        1,
        "latest previous count",
      );
      equal(result.summary.after.counts.transactions, 3, "result count");
      equal(
        result.summary.after.balances.find(
          (account) => account.accountId === "card",
        )?.balance,
        102000,
        "actual result balance",
      );
      equal(encodeBackup(first.state), before, "S0 is immutable");
      const ids = result.state.transactions.map((entry) => entry.id);
      rejects(
        () =>
          applyCsvImportWithSummary(
            result.state,
            {
              table,
              options: options(table.headers),
              excluded: new Set([4]),
              overrides: {},
            },
            TODAY,
          ),
        /Нет новых/,
      );
      equal(
        result.state.transactions.map((entry) => entry.id),
        ids,
        "repeat must not recreate IDs",
      );
    },
  },
  {
    name: "failed packet is atomic; previously imported files remain and subsequent retry does not duplicate them",
    run() {
      const state = ledger(19_998);
      const firstTable = parseCsv(
        "Date;Description;Amount;ID\n2026-10-15;Part one;1;one",
      );
      const firstInput = {
        table: firstTable,
        options: options(firstTable.headers),
        excluded: new Set<number>(),
        overrides: {},
      };
      const first = applyCsvImportWithSummary(state, firstInput, TODAY);
      const before = encodeBackup(first.state);
      const secondTable = parseCsv(
        "Date;Description;Amount;ID\n2026-10-15;Part two;1;two\n2026-10-15;Part three;1;three",
      );
      rejects(
        () =>
          applyCsvImportWithSummary(
            first.state,
            { ...firstInput, table: secondTable },
            TODAY,
          ),
        /20 000/,
      );
      equal(encodeBackup(first.state), before, "failed next file is atomic");
      rejects(
        () => applyCsvImportWithSummary(first.state, firstInput, TODAY),
        /Нет новых/,
      );
      equal(
        first.summary.after.counts.transactions,
        19999,
        "prior accepted file remains",
      );
    },
  },
  {
    name: "snapshot results preserve currency units and dated adjustments without inventing unknown previous counts",
    run() {
      const state = ledger();
      const card = state.accounts[0];
      card.currency = "KWD";
      card.openingBalance = 12345;
      state.accounts.find((account) => account.id === "savings")!.currency =
        "JPY";
      state.balanceAdjustments = [
        {
          id: "adjust-before",
          accountId: card.id,
          date: TODAY,
          amount: 1000,
          note: "Тест",
        },
        {
          id: "adjust-future",
          accountId: card.id,
          date: "2026-10-16",
          amount: 9000,
          note: "Тест",
        },
      ];
      const summary = buildFinanceSnapshotSummary(state, TODAY);
      equal(summary.asOf, TODAY, "balance date");
      equal(summary.balances[0].currency, "KWD", "three-decimal currency");
      equal(summary.balances[0].balance, 13345, "dated minor-unit balance");
      equal(
        summary.counts.balanceAdjustments,
        2,
        "entity count includes complete snapshot",
      );
      const originalName = summary.balances[0].name;
      card.name = "Новое имя";
      equal(summary.balances[0].name, originalName, "summary is detached");
      const unknown = buildReplacementImportSummary(null, state, TODAY);
      equal(
        [unknown.before, unknown.beforeStatus],
        [null, "unknown"],
        "unknown prior snapshot",
      );
      const destination = buildReplacementImportSummary(
        state,
        state,
        TODAY,
        "new-profile",
      );
      equal(
        [destination.before, destination.beforeStatus],
        [null, "new-profile"],
        "new destination has no previous active-profile data",
      );
    },
  },
  {
    name: "full restore keeps all JSON relationships, repeats current-date validation and rejects rescue replacement",
    run() {
      const source = createInitialState(true, TODAY);
      const candidate = verified(source);
      const current = ledger(1);
      const restored = restoreFinanceWithSummary(current, candidate, TODAY);
      equal(
        encodeBackup(restored.state),
        encodeBackup({ ...candidate.state, demo: current.demo }),
        "full normalized JSON preserved",
      );
      equal(
        restored.summary.before?.counts.transactions,
        1,
        "replace previous count",
      );
      equal(
        restored.summary.after.counts.transactions,
        candidate.state.transactions.length,
        "replace result count",
      );
      rejects(
        () => restoreFinanceWithSummary(current, verified(source, true), TODAY),
        /новый профиль/,
      );
      const future = ledger(1);
      future.transactions[0].date = TODAY;
      const futureCandidate = verified(future);
      rejects(
        () => restoreFinanceWithSummary(current, futureCandidate, "2026-10-14"),
        /прочитать файл/,
      );
      equal(current.transactions.length, 1, "failed restore unchanged");
    },
  },
];
