import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendTransaction,
  deleteTransaction,
  saveTransaction,
} from "../src/domain/actions/transactions";
import { setCategoryArchived } from "../src/domain/actions/categories";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { parseCsv } from "../src/domain/csv";
import { exportTransactionsCsv } from "../src/domain/csvExport";
import { accountBalance } from "../src/domain/accountBalances";
import { RATE_SCALE } from "../src/domain/currency";
import { createInitialState } from "../src/domain/seed";
import {
  allocateAmount,
  expenseContributions,
  refundedAmount,
  transactionIncomeAmount,
  validateTransactionAmountsState,
} from "../src/domain/transactionAmounts";
import type { FinanceState, Transaction } from "../src/domain/types";

const TODAY = "2026-09-10";
function initial() {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1000000;
  return state;
}
function purchase(state = initial()) {
  return saveTransaction(
    state,
    {
      type: "expense",
      title: "Супермаркет",
      amount: 360000,
      date: "2026-09-08",
      accountId: "card",
      category: "other",
      splits: [
        { category: "groceries", amount: 250000 },
        { category: "home", amount: 80000 },
        { category: "health", amount: 30000 },
      ],
    },
    TODAY,
  );
}
function refund(
  state: FinanceState,
  amount: number,
  id = state.transactions.find((t) => t.type === "expense")!.id,
) {
  return saveTransaction(
    state,
    {
      type: "income",
      title: "Возврат",
      amount,
      date: TODAY,
      accountId: "card",
      category: "other",
      refundOf: id,
    },
    TODAY,
  );
}

test("split purchase debits once and exposes exact category parts; malformed edits are atomic", () => {
  const state = purchase();
  assert.equal(state.transactions.length, 1);
  assert.equal(accountBalance(state, "card", TODAY), 640000);
  assert.deepEqual(expenseContributions(state, state.transactions[0]), [
    { category: "groceries", amount: 250000 },
    { category: "home", amount: 80000 },
    { category: "health", amount: 30000 },
  ]);
  const before = encodeBackup(state);
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          ...state.transactions[0],
          splits: [
            { category: "groceries", amount: 200000 },
            { category: "home", amount: 100000 },
          ],
        },
        TODAY,
      ),
    /совпадать/,
  );
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          ...state.transactions[0],
          splits: [
            { category: "groceries", amount: 200000 },
            { category: "groceries", amount: 160000 },
          ],
        },
        TODAY,
      ),
    /одинаковой/,
  );
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          ...state.transactions[0],
          splits: [
            { category: "groceries", amount: 360000 },
            { category: "health", amount: 0 },
          ],
        },
        TODAY,
      ),
    /положительной/,
  );
  assert.equal(encodeBackup(state), before);
});

test("partial refunds credit actual dates, reduce expenses and never increase ordinary income", () => {
  const state = purchase();
  const next = refund(state, 180000);
  const entry = next.transactions[0];
  assert.equal(transactionIncomeAmount(next, entry), 0);
  assert.equal(refundedAmount(next, state.transactions[0].id), 180000);
  assert.equal(accountBalance(next, "card", "2026-09-09"), 640000);
  assert.equal(accountBalance(next, "card", TODAY), 820000);
  assert.deepEqual(expenseContributions(next, entry), [
    { category: "groceries", amount: -125000 },
    { category: "home", amount: -40000 },
    { category: "health", amount: -15000 },
  ]);
  assert.throws(() => refund(next, 180001), /превышает/);
  assert.throws(
    () => saveTransaction(next, { ...entry, date: "2026-09-07" }, TODAY),
    /раньше/,
  );
  assert.throws(
    () => saveTransaction(next, { ...entry, plannedIncomeId: "plan" }, TODAY),
    /без связи/,
  );
  assert.throws(
    () => deleteTransaction(next, state.transactions[0].id, TODAY),
    /есть возвраты/,
  );
  assert.throws(
    () =>
      saveTransaction(
        next,
        { ...state.transactions[0], amount: 100000, splits: undefined },
        TODAY,
      ),
    /превышает/,
  );
  assert.throws(
    () => saveTransaction(next, { ...entry, type: "expense" }, TODAY),
    /Сохраните связь/,
  );
  assert.equal(deleteTransaction(next, entry.id, TODAY).transactions.length, 1);
});

test("historical base rounding and repeated tiny refunds preserve every minor unit", () => {
  assert.deepEqual(allocateAmount(5, [1, 1, 1]), [2, 2, 1]);
  const state = initial();
  state.transactions = [
    {
      id: "purchase",
      type: "expense",
      title: "Чек",
      amount: 3,
      baseAmount: 3,
      date: "2026-09-08",
      accountId: "card",
      category: "other",
      splits: [
        { category: "groceries", amount: 1 },
        { category: "home", amount: 1 },
        { category: "health", amount: 1 },
      ],
    },
  ];
  let next = state;
  for (const id of ["refund-a", "refund-b", "refund-c"])
    next = appendTransaction(
      next,
      {
        id,
        type: "income",
        title: "Возврат",
        amount: 1,
        baseAmount: 1,
        date: TODAY,
        accountId: "card",
        category: "other",
        refundOf: "purchase",
      },
      TODAY,
    );
  const totals = new Map<string, number>();
  for (const entry of next.transactions)
    for (const part of expenseContributions(next, entry))
      totals.set(part.category, (totals.get(part.category) ?? 0) + part.amount);
  assert.deepEqual([...totals.values()], [0, 0, 0]);
  const foreign = {
    ...state,
    transactions: [{ ...state.transactions[0], baseAmount: 5 }],
  };
  assert.deepEqual(
    expenseContributions(foreign, foreign.transactions[0]).map(
      (part) => part.amount,
    ),
    [2, 2, 1],
  );
});

test("cross-currency refund caps original principal and uses actual incoming valuation", () => {
  let state = purchase();
  state.accounts.push({
    ...state.accounts[0],
    id: "usd",
    currency: "USD",
    openingBalance: 0,
  });
  state.settings.exchange = {
    automatic: false,
    rates: { USD: { value: 90 * RATE_SCALE, date: TODAY, source: "manual" } },
  };
  const input = {
    type: "income" as const,
    title: "Возврат в долларах",
    amount: 2000,
    baseAmount: 180000,
    date: TODAY,
    accountId: "usd",
    category: "other",
    refundOf: state.transactions[0].id,
    refundSourceAmount: 170000,
  };
  assert.throws(
    () =>
      saveTransaction(
        state,
        { ...input, refundSourceAmount: undefined },
        TODAY,
      ),
    /валюте исходной/,
  );
  state = saveTransaction(state, input, TODAY);
  assert.equal(accountBalance(state, "usd", TODAY), 2000);
  assert.equal(refundedAmount(state, input.refundOf), 170000);
  assert.equal(
    expenseContributions(state, state.transactions[0]).reduce(
      (sum, part) => sum + part.amount,
      0,
    ),
    -180000,
  );
  assert.throws(
    () =>
      saveTransaction(
        state,
        { ...input, amount: 3000, refundSourceAmount: 190001 },
        TODAY,
      ),
    /превышает/,
  );
  const changedRate = {
    ...state,
    settings: {
      ...state.settings,
      exchange: {
        automatic: false,
        rates: {
          USD: {
            value: 110 * RATE_SCALE,
            date: TODAY,
            source: "manual" as const,
          },
        },
      },
    },
  };
  assert.deepEqual(
    expenseContributions(changedRate, state.transactions[0]),
    expenseContributions(state, state.transactions[0]),
  );
});

test("CSV exports only parts, with unique row IDs, group link and refund link in both formats", () => {
  const state = refund(purchase(), 180000);
  const exported = exportTransactionsCsv(state, { format: "universal" }, TODAY);
  assert.equal(exported.transactionCount, 2);
  assert.equal(exported.count, 6);
  const table = parseCsv(exported.content);
  assert.equal(
    table.rows.reduce((sum, row) => sum + Math.round(Number(row[2]) * 100), 0),
    -180000,
  );
  assert.equal(new Set(table.rows.map((row) => row[9])).size, 6);
  assert.equal(table.rows.filter((row) => row[1] === "expense").length, 3);
  assert.ok(table.rows.every((row) => row[15]));
  assert.ok(
    table.rows
      .filter((row) => row[1] === "income")
      .every((row) => row[16] === state.transactions[1].id),
  );
  const ynab = parseCsv(
    exportTransactionsCsv(state, { format: "ynab", accountId: "card" }, TODAY)
      .content,
  );
  assert.equal(
    ynab.rows.reduce(
      (sum, row) =>
        sum +
        Math.round(Number(row[4] || 0) * 100) -
        Math.round(Number(row[3] || 0) * 100),
      0,
    ),
    -180000,
  );
  assert.ok(ynab.rows.every((row) => row[2].includes("операция")));
});

test("backup preserves parts/refund links, validates orphaned returns and retains archived purchase references", () => {
  let state = purchase();
  const id = state.transactions[0].id;
  state = setCategoryArchived(state, "groceries", true);
  const next = refund(state, 1000, id);
  const restored = decodeBackup(encodeBackup(next));
  assert.deepEqual(
    restored.transactions.map((entry) => entry.splits),
    next.transactions.map((entry) => entry.splits),
  );
  assert.equal(restored.transactions[0].refundOf, id);
  const orphaned = {
    ...next,
    transactions: next.transactions.filter((entry) => entry.id !== id),
  };
  assert.throws(() => validateTransactionAmountsState(orphaned), /не найдена/);
  assert.throws(() => decodeBackup(encodeBackup(orphaned)), /не найдена/);
  const plain: Transaction = {
    id: "new",
    type: "expense",
    title: "Чек",
    amount: 100,
    date: TODAY,
    accountId: "card",
    category: "other",
    splits: [
      { category: "groceries", amount: 50 },
      { category: "home", amount: 50 },
    ],
  };
  assert.throws(() => appendTransaction(state, plain, TODAY), /архиве/);
});

test("a purchase with refunds keeps its currency; same-currency account changes and metadata preserve semantics", () => {
  let state = initial();
  state.settings.exchange = {
    automatic: false,
    rates: {
      USD: { value: 90 * RATE_SCALE, date: TODAY, source: "manual" },
      EUR: { value: 100 * RATE_SCALE, date: TODAY, source: "manual" },
    },
  };
  state.accounts.push(
    {
      ...state.accounts[0],
      id: "usd",
      currency: "USD",
      openingBalance: 100000,
    },
    {
      ...state.accounts[0],
      id: "usd-second",
      currency: "USD",
      openingBalance: 100000,
    },
    {
      ...state.accounts[0],
      id: "eur",
      currency: "EUR",
      openingBalance: 100000,
    },
  );
  state = saveTransaction(
    state,
    {
      type: "expense",
      title: "Покупка USD",
      amount: 10000,
      accountId: "usd",
      category: "other",
      date: "2026-09-08",
    },
    TODAY,
  );
  const expense = state.transactions[0];
  state = saveTransaction(
    state,
    {
      type: "income",
      title: "Возврат в RUB",
      amount: 450000,
      accountId: "card",
      category: "other",
      date: TODAY,
      refundOf: expense.id,
      refundSourceAmount: 5000,
    },
    TODAY,
  );
  const before = encodeBackup(state);
  assert.throws(
    () =>
      saveTransaction(
        state,
        { ...expense, accountId: "eur", baseAmount: undefined },
        TODAY,
      ),
    /изменить валюту покупки/,
  );
  assert.equal(encodeBackup(state), before);
  const moved = saveTransaction(
    state,
    { ...expense, accountId: "usd-second" },
    TODAY,
  );
  assert.equal(
    moved.transactions.find((entry) => entry.id === expense.id)?.accountId,
    "usd-second",
  );
  assert.equal(refundedAmount(moved, expense.id), 5000);
  assert.equal(
    decodeBackup(encodeBackup(moved)).transactions.find(
      (entry) => entry.refundOf,
    )?.refundSourceAmount,
    5000,
  );
  const changedRate = {
    ...state,
    settings: {
      ...state.settings,
      exchange: {
        automatic: false,
        rates: {
          ...state.settings.exchange!.rates,
          USD: {
            value: 110 * RATE_SCALE,
            date: TODAY,
            source: "manual" as const,
          },
        },
      },
    },
  };
  const renamed = saveTransaction(
    changedRate,
    {
      ...expense,
      title: "Уточнённое название",
      note: "Чек найден",
      baseAmount: undefined,
    },
    TODAY,
  );
  assert.equal(
    renamed.transactions.find((entry) => entry.id === expense.id)?.baseAmount,
    expense.baseAmount,
  );
  assert.deepEqual(
    expenseContributions(
      renamed,
      renamed.transactions.find((entry) => entry.refundOf)!,
    ),
    expenseContributions(
      state,
      state.transactions.find((entry) => entry.refundOf)!,
    ),
  );
});
