import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialState } from "../src/domain/seed";
import {
  selectTransactionList,
  type TransactionListFilters,
} from "../src/domain/transactionList";
import type { Transaction } from "../src/domain/types";

const TODAY = "2026-09-10";
const filters: TransactionListFilters = {
  month: "2026-09",
  query: "",
  type: "all",
  account: "all",
  category: "all",
};
function entry(id: string, patch: Partial<Transaction> = {}): Transaction {
  return {
    id,
    title: id,
    type: "expense",
    amount: 100,
    date: TODAY,
    category: "other",
    accountId: "card",
    ...patch,
  };
}
function fixture() {
  const state = createInitialState(false, TODAY);
  state.categories.push({
    ...state.categories.find((category) => category.id === "home")!,
    id: "home-child",
    name: "Ремонт",
    parentId: "home",
    budget: 0,
    archived: true,
  });
  state.transactions = [
    entry("purchase", {
      title: "Покупка",
      note: "ЧЕК из магазина",
      date: "2026-09-08",
      amount: 1000,
      baseAmount: 2000,
      splits: [
        { category: "groceries", amount: 600 },
        { category: "home-child", amount: 400 },
      ],
    }),
    entry("refund", {
      type: "income",
      amount: 250,
      baseAmount: 500,
      refundOf: "purchase",
    }),
    entry("salary", { type: "income", amount: 5000 }),
    entry("debt", { type: "income", amount: 8000, debtId: "debt" }),
    entry("transfer", { type: "transfer", toAccountId: "savings" }),
    entry("old", { date: "2026-08-31" }),
    entry("future", { date: "2026-09-11", type: "income", amount: 9000 }),
  ];
  return state;
}

test("list totals use historical split values and exclude refunds and debts from income", () => {
  const state = fixture();
  const before = structuredClone(state);
  const result = selectTransactionList(state, filters, TODAY);
  assert.deepEqual(
    result.transactions.map((transaction) => transaction.id),
    ["refund", "salary", "debt", "transfer", "purchase"],
  );
  assert.equal(result.income, 5000);
  assert.equal(result.expense, 1500);
  assert.deepEqual(state, before);
  assert.equal(result.transactions.at(-1), state.transactions[0]);
});

test("expense/category filters include refunds and archived children, with only matching parts in totals", () => {
  const state = fixture();
  for (const category of ["home", "home-child"]) {
    const result = selectTransactionList(
      state,
      { ...filters, type: "expense", category },
      TODAY,
    );
    assert.deepEqual(
      result.transactions.map((transaction) => transaction.id),
      ["refund", "purchase"],
    );
    assert.equal(result.expense, 600);
    assert.equal(result.income, 0);
  }
  const result = selectTransactionList(
    state,
    { ...filters, month: "2026-09", category: "home", query: "refund" },
    TODAY,
  );
  assert.equal(result.expense, -200);
});

test("type and account filters retain transfers on both sides and distinguish debt principal", () => {
  const state = fixture();
  for (const [type, ids, income] of [
    ["income", ["salary"], 5000],
    ["debt", ["debt"], 0],
    ["transfer", ["transfer"], 0],
  ] as const) {
    const result = selectTransactionList(state, { ...filters, type }, TODAY);
    assert.deepEqual(
      result.transactions.map((transaction) => transaction.id),
      ids,
    );
    assert.equal(result.income, income);
    assert.equal(result.expense, 0);
  }
  const incoming = selectTransactionList(
    state,
    { ...filters, account: "savings" },
    TODAY,
  );
  assert.deepEqual(
    incoming.transactions.map((transaction) => transaction.id),
    ["transfer"],
  );
  assert.equal(
    selectTransactionList(
      state,
      { ...filters, type: "transfer", account: "card" },
      TODAY,
    ).transactions.length,
    1,
  );
  assert.equal(
    selectTransactionList(
      state,
      { ...filters, type: "debt", category: "other" },
      TODAY,
    ).transactions.length,
    0,
  );
});

test("search trims once, matches Russian titles and notes, and honors month and cutoff", () => {
  const state = fixture();
  for (const query of ["  чЕк  ", "ПОКУПКА"]) {
    const result = selectTransactionList(state, { ...filters, query }, TODAY);
    assert.deepEqual(
      result.transactions.map((transaction) => transaction.id),
      ["purchase"],
    );
    assert.equal(result.expense, 2000);
  }
  assert.equal(
    selectTransactionList(state, { ...filters, month: "2026-08" }, TODAY)
      .transactions.length,
    1,
  );
  assert.deepEqual(
    selectTransactionList(state, { ...filters, month: "2026-10" }, TODAY),
    { transactions: [], income: 0, expense: 0 },
  );
});

test("totals include all rows beyond the display page and selection recomputes against current state", () => {
  const state = fixture();
  state.transactions = Array.from({ length: 125 }, (_, index) =>
    entry(String(index)),
  );
  const result = selectTransactionList(state, filters, TODAY);
  assert.equal(result.transactions.length, 125);
  assert.equal(result.expense, 12500);
  const updated = {
    ...state,
    transactions: [
      ...state.transactions,
      entry("extra", { type: "income", amount: 2000 }),
    ],
  };
  assert.equal(selectTransactionList(updated, filters, TODAY).income, 2000);
  assert.equal(result.income, 0);
});

test("all-history search crosses months and years while retaining every filter and the date cutoff", () => {
  const state = fixture();
  state.transactions.push(
    entry("last-year", {
      title: "Покупка за прошлый год",
      date: "2025-12-31",
      category: "home-child",
      amount: 300,
    }),
    entry("last-month", {
      title: "Другая покупка",
      note: "Чек за август",
      date: "2026-08-31",
      category: "home-child",
      amount: 500,
    }),
    entry("other-account", {
      title: "Покупка на другом счёте",
      date: "2026-08-30",
      accountId: "savings",
      category: "home-child",
      amount: 700,
    }),
  );
  const before = structuredClone(state);
  const all = { ...filters, period: "all" as const };
  const result = selectTransactionList(
    state,
    {
      ...all,
      query: " ПОКУПКА ",
      type: "expense",
      account: "card",
      category: "home",
    },
    TODAY,
  );
  assert.deepEqual(
    result.transactions.map((transaction) => transaction.id),
    ["purchase", "last-month", "last-year"],
  );
  assert.equal(result.expense, 1600);
  assert.equal(result.income, 0);
  assert.deepEqual(
    selectTransactionList(
      state,
      { ...all, query: "чек" },
      TODAY,
    ).transactions.map((transaction) => transaction.id),
    ["purchase", "last-month"],
  );
  const full = selectTransactionList(state, all, TODAY);
  assert.equal(full.transactions.length, 9);
  assert.equal(full.income, 5000);
  assert.equal(full.expense, 3100);
  assert.equal(
    selectTransactionList(state, { ...all, month: "2024-01" }, TODAY).expense,
    full.expense,
  );
  assert.deepEqual(state, before);
});

test("all-history totals include matches past the first page without changing default monthly selection", () => {
  const state = fixture();
  state.transactions = Array.from({ length: 125 }, (_, index) =>
    entry(String(index), {
      date: index < 70 ? TODAY : "2026-08-31",
      amount: index + 1,
    }),
  );
  const before = structuredClone(state);
  const monthly = selectTransactionList(state, filters, TODAY);
  const all = selectTransactionList(
    state,
    { ...filters, period: "all" },
    TODAY,
  );
  assert.equal(monthly.transactions.length, 70);
  assert.equal(monthly.expense, (70 * 71) / 2);
  assert.equal(all.transactions.length, 125);
  assert.equal(all.transactions.slice(0, 60).length, 60);
  assert.equal(all.expense, (125 * 126) / 2);
  assert.deepEqual(state, before);
});
