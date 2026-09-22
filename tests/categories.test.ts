import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { categoryLabel, categoryMatches } from "../src/domain/categories";
import { categorySpending } from "../src/domain/finance";
import {
  appendTransaction,
  payRecurring,
  saveBudget,
  saveCategory,
  saveTransaction,
  setCategoryArchived,
} from "../src/domain/actions";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
  previewCsv,
} from "../src/domain/csv";
import type { CategoryInput } from "../src/domain/actions";

const TODAY = "2026-09-10";
const input: CategoryInput = {
  name: "Ремонт",
  parentId: "home",
  icon: "home-outline",
  color: "#52768A",
  background: "#E8F0F5",
};
function fixture() {
  const state = saveCategory(createInitialState(false, TODAY), input);
  state.accounts[0].openingBalance = 100000;
  return state;
}
test("subcategories share the parent budget without double-counting expenses, and rename preserves links", () => {
  const state = fixture(),
    child = state.categories.at(-1)!;
  const next = saveBudget(
    saveTransaction(
      state,
      {
        type: "expense",
        title: "Краска",
        date: TODAY,
        amount: 12345,
        accountId: "card",
        category: child.id,
      },
      TODAY,
    ),
    "home",
    50000,
  );
  const rows = categorySpending(next, "2026-09", TODAY);
  assert.equal(rows.find((c) => c.id === "home")!.spent, 12345);
  assert.equal(
    rows.reduce((sum, c) => sum + c.spent, 0),
    12345,
  );
  assert.equal(
    rows.some((c) => c.id === child.id),
    false,
  );
  assert.equal(categoryMatches(next, child.id, "home"), true);
  assert.throws(() => saveBudget(next, child.id, 100));
  const renamed = saveCategory(next, { ...child, name: "Для ремонта" });
  assert.equal(categoryLabel(renamed, child.id), "Дом / Для ремонта");
  assert.equal(renamed.transactions[0].category, child.id);
  assert.equal(state.transactions.length, 0);
  assert.deepEqual(
    decodeBackup(encodeBackup(renamed)),
    JSON.parse(JSON.stringify(renamed)),
  );
});
test("archiving cascades to children but retains history and existing payment plans", () => {
  let state = fixture(),
    child = state.categories.at(-1)!;
  state = saveTransaction(
    state,
    {
      type: "expense",
      title: "Обои",
      amount: 100,
      date: TODAY,
      category: child.id,
      accountId: "card",
    },
    TODAY,
  );
  state.recurring = [
    {
      id: "bill",
      name: "Ремонт в рассрочку",
      amount: 200,
      day: 10,
      startsOn: TODAY,
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#FFFFFF",
      category: child.id,
      accountId: "card",
    },
  ];
  const archived = setCategoryArchived(state, "home", true);
  assert.ok(archived.categories.find((c) => c.id === child.id)!.archived);
  assert.deepEqual(archived.transactions, state.transactions);
  assert.equal(
    categorySpending(archived, "2026-09", TODAY).find((c) => c.id === "home")!
      .budget,
    0,
  );
  assert.throws(
    () =>
      saveTransaction(
        archived,
        { ...state.transactions[0], id: undefined },
        TODAY,
      ),
    /архиве/,
  );
  assert.throws(
    () =>
      appendTransaction(
        archived,
        { ...state.transactions[0], id: "csv-new" },
        TODAY,
      ),
    /архиве/,
  );
  assert.equal(
    saveTransaction(
      archived,
      { ...state.transactions[0], title: "Исправлено" },
      TODAY,
    ).transactions[0].title,
    "Исправлено",
  );
  assert.equal(
    payRecurring(archived, "bill", TODAY, TODAY).transactions.length,
    2,
  );
  assert.throws(
    () => setCategoryArchived(archived, child.id, false),
    /основную/,
  );
  assert.equal(
    setCategoryArchived(archived, "home", false).categories.find(
      (c) => c.id === child.id,
    )!.archived,
    true,
  );
  assert.throws(() => setCategoryArchived(state, "other", true));
});
test("category hierarchy, sibling names and fallback are validated on writes and restore", () => {
  const state = fixture(),
    child = state.categories.at(-1)!;
  assert.throws(
    () => saveCategory(state, { ...input, name: " ремонт " }),
    /Названия/,
  );
  assert.throws(
    () => saveCategory(state, { ...input, parentId: child.id }),
    /основной/,
  );
  assert.throws(
    () => saveCategory(state, { ...child, parentId: "shopping" }),
    /историю/,
  );
  for (const mutate of [
    (s: typeof state) => {
      s.categories.find((c) => c.id === "home")!.parentId = child.id;
    },
    (s: typeof state) => {
      s.categories.at(-1)!.parentId = "missing";
    },
    (s: typeof state) => {
      s.categories.at(-1)!.budget = 1;
    },
    (s: typeof state) => {
      s.categories = s.categories.filter((c) => c.id !== "other");
    },
    (s: typeof state) => {
      s.transactions = [
        {
          id: "t",
          type: "expense",
          title: "Test",
          amount: 1,
          date: TODAY,
          accountId: "card",
          category: "missing",
        },
      ];
    },
  ]) {
    const copy = structuredClone(state);
    mutate(copy);
    assert.throws(() => decodeBackup(encodeBackup(copy)));
  }
});
test("version 1 migrates without losing operations; newer unknown versions fail closed", () => {
  const old = {
    ...createInitialState(true, TODAY),
    version: 1,
    scenarios: undefined,
  };
  const restored = decodeBackup(JSON.stringify(old));
  assert.equal(restored.version, 4);
  assert.deepEqual(restored.scenarios, []);
  assert.deepEqual(
    restored.transactions,
    JSON.parse(JSON.stringify(old.transactions)),
  );
  assert.deepEqual(decodeBackup(encodeBackup(restored)), restored);
  assert.throws(() => decodeBackup(JSON.stringify({ ...old, version: 99 })));
});
test("CSV recognizes a custom category path and falls back when an automatic category is archived", () => {
  const state = setCategoryArchived(fixture(), "cafe", true);
  const table = parseCsv(
    "Date,Description,Amount,Category\n2026-09-10,Краска,-12.45,Дом / Ремонт\n2026-09-10,Кофе,-3.00,Кафе и рестораны",
  );
  const options = {
    accountId: "card",
    mapping: guessCsvMapping(table.headers),
    mode: "signed" as const,
    positive: "income" as const,
    dateOrder: "dmy" as const,
  };
  const rows = previewCsv(state, table, options, {}, TODAY);
  assert.equal(rows[0].transaction?.category, state.categories.at(-1)!.id);
  assert.equal(rows[1].transaction?.category, "other");
  assert.equal(
    applyCsvImport(state, table, options, new Set(), {}, TODAY).transactions
      .length,
    2,
  );
});

test("CSV does not silently choose between colliding custom paths or archived overrides", () => {
  let state = fixture();
  state = saveCategory(state, {
    ...input,
    name: "Дом / Ремонт",
    parentId: undefined,
  });
  const table = parseCsv(
    "Date,Description,Amount,Category\n2026-09-10,Краска,-12.45,Дом / Ремонт",
  );
  const options = {
    accountId: "card",
    mapping: guessCsvMapping(table.headers),
    mode: "signed" as const,
    positive: "income" as const,
    dateOrder: "dmy" as const,
  };
  const rows = previewCsv(state, table, options, {}, TODAY);
  assert.match(rows[0].error!, /неоднозначно/);
  const child = state.categories.find((c) => c.parentId === "home")!;
  assert.equal(
    previewCsv(
      state,
      table,
      options,
      { [rows[0].line]: { category: child.id } },
      TODAY,
    )[0].transaction?.category,
    child.id,
  );
  const archived = setCategoryArchived(state, child.id, true);
  assert.match(
    previewCsv(
      archived,
      table,
      options,
      { [rows[0].line]: { category: child.id } },
      TODAY,
    )[0].error!,
    /архиве/,
  );
  assert.throws(
    () =>
      saveCategory(state, {
        ...input,
        name: "Invalid",
        icon: "invalid-icon" as never,
      }),
    /значок/,
  );
});
