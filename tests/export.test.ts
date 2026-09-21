import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain/seed";
import { exportTransactionsCsv } from "../src/domain/csvExport";
import { parseCsv } from "../src/domain/csv";
import { saveCategory, saveTransaction } from "../src/domain/actions";
import { encodeBackup } from "../src/domain/backup";

const TODAY = "2026-09-10";
function fixture() {
  let state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  state = saveCategory(state, {
    name: 'Ремонт, "дом"',
    parentId: "home",
    icon: "home-outline",
    color: "#FFFFFF",
    background: "#FFFFFF",
  });
  state = saveTransaction(
    state,
    {
      title: 'Краска, "Белая"',
      amount: 12345,
      date: TODAY,
      category: state.categories.at(-1)!.id,
      accountId: "card",
      type: "expense",
      note: "Первая строка\nВторая строка",
    },
    TODAY,
  );
  state = saveTransaction(
    state,
    {
      title: "В накопления",
      amount: 50000,
      date: TODAY,
      category: "other",
      accountId: "card",
      toAccountId: "savings",
      type: "transfer",
    },
    TODAY,
  );
  state = saveTransaction(
    state,
    {
      title: "Подработка",
      amount: 100000,
      date: "2026-09-09",
      category: "other",
      accountId: "card",
      type: "income",
    },
    TODAY,
  );
  return state;
}
test("universal CSV preserves exact kopecks, Unicode, category paths, quotes and multiline notes", () => {
  const state = fixture(),
    before = encodeBackup(state);
  const result = exportTransactionsCsv(state, { format: "universal" }, TODAY);
  assert.equal(result.count, 3);
  assert.ok(result.content.startsWith("\uFEFFDate,"));
  const table = parseCsv(result.content);
  const row = table.rows.find((r) => r[1] === "expense")!;
  assert.equal(row[2], "-123.45");
  assert.equal(row[3], "RUB");
  assert.equal(row[4], 'Краска, "Белая"');
  assert.equal(row[5], 'Дом / Ремонт, "дом"');
  assert.equal(row[8], "Первая строка\nВторая строка");
  const transfer = table.rows.filter((r) => r[1] === "transfer");
  assert.equal(transfer.length, 1);
  assert.deepEqual(transfer[0].slice(6, 8), ["Основная карта", "Накопления"]);
  assert.equal(encodeBackup(state), before);
});
test("account and date filters give transfers the correct sign without inventing additional transactions", () => {
  const state = fixture();
  const target = parseCsv(
    exportTransactionsCsv(
      state,
      {
        format: "universal",
        accountId: "savings",
        from: TODAY,
        through: TODAY,
      },
      TODAY,
    ).content,
  );
  assert.equal(target.rows.length, 1);
  assert.equal(target.rows[0][2], "500.00");
  assert.equal(
    exportTransactionsCsv(state, { format: "universal", from: TODAY }, TODAY)
      .count,
    2,
  );
  assert.throws(() => exportTransactionsCsv(state, { format: "ynab" }, TODAY));
  assert.throws(() =>
    exportTransactionsCsv(
      state,
      { format: "universal", from: "2026-09-11", through: TODAY },
      TODAY,
    ),
  );
  assert.throws(() =>
    exportTransactionsCsv(
      state,
      { format: "universal", accountId: "missing" },
      TODAY,
    ),
  );
  assert.equal(
    exportTransactionsCsv(
      state,
      { format: "universal", through: "2026-09-01" },
      TODAY,
    ).count,
    0,
  );
});
test("YNAB layout uses separate inflow/outflow columns; spreadsheet formulas are escaped only in text", () => {
  const state = fixture();
  state.transactions.find((t) => t.type === "income")!.title =
    '=HYPERLINK("https://example.invalid")';
  state.transactions.find((t) => t.type === "expense")!.note = "  @SUM(A1:A9)";
  const table = parseCsv(
    exportTransactionsCsv(state, { format: "ynab", accountId: "card" }, TODAY)
      .content,
  );
  assert.deepEqual(table.headers, [
    "Date",
    "Payee",
    "Memo",
    "Outflow",
    "Inflow",
  ]);
  assert.equal(table.rows[0][1], '\'=HYPERLINK("https://example.invalid")');
  assert.deepEqual(table.rows[0].slice(3), ["", "1000.00"]);
  assert.ok(table.rows.some((r) => r[3] === "123.45" && r[4] === ""));
  assert.ok(
    table.rows.some((r) => r[2].startsWith("Перевод:") && r[3] === "500.00"),
  );
  const raw = parseCsv(
    exportTransactionsCsv(state, { format: "universal" }, TODAY).content,
  );
  assert.ok(raw.rows.some((r) => r[8] === "'  @SUM(A1:A9)"));
  const savings = parseCsv(
    exportTransactionsCsv(
      state,
      { format: "ynab", accountId: "savings" },
      TODAY,
    ).content,
  );
  assert.deepEqual(savings.rows[0].slice(3), ["", "500.00"]);
});
