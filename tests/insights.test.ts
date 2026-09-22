import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dailySpendingEstimate,
  monthlyOverview,
  recurringSuggestions,
  spendingComparison,
} from "../src/domain/insights";
import { createInitialState } from "../src/domain/seed";
import type { FinanceState, Transaction } from "../src/domain/types";

const TODAY = "2026-09-20";
function fixture() {
  return createInitialState(false, TODAY);
}
function transaction(
  id: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date,
    amount,
    title: "Магазин",
    accountId: "card",
    category: "groceries",
    type: "expense",
    ...extra,
  };
}
function withHistory(state: FinanceState, date: string) {
  state.transactions.push(transaction("history", date, 0, { type: "income" }));
  return state;
}

test("spending explanation compares equal elapsed days, includes subcategories once and exposes contributing operations", () => {
  const state = withHistory(fixture(), "2026-08-01");
  state.categories.push({
    ...state.categories[0],
    id: "delivery",
    name: "Доставка",
    parentId: "groceries",
    budget: 0,
  });
  state.transactions.push(
    transaction("previous", "2026-08-10", 2_000),
    transaction("previous-late", "2026-08-21", 90_000),
    transaction("current", "2026-09-10", 3_000),
    transaction("child", "2026-09-20", 4_500, { category: "delivery" }),
    transaction("future", "2026-09-21", 80_000),
    transaction("transfer", "2026-09-10", 50_000, {
      type: "transfer",
      toAccountId: "cash",
    }),
  );
  const before = JSON.stringify(state);
  const result = spendingComparison(state, "2026-09", TODAY);
  assert.equal(result.days, 20);
  assert.equal(result.previousEnd, "2026-08-20");
  assert.equal(result.hasHistory, true);
  assert.equal(result.current, 7_500);
  assert.equal(result.previous, 2_000);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].difference, 5_500);
  assert.deepEqual(
    result.changes[0].currentTransactions.map((item) => item.transactionId),
    ["child", "current"],
  );
  assert.equal(JSON.stringify(state), before);
});

test("short-month comparison uses the same number of days, including leap February", () => {
  const state = withHistory(fixture(), "2024-02-01");
  state.transactions.push(
    transaction("leap", "2024-02-29", 2_000),
    transaction("march", "2024-03-29", 3_000),
    transaction("extra-days", "2024-03-31", 100_000),
  );
  const result = spendingComparison(state, "2024-03", "2024-03-31");
  assert.equal(result.days, 29);
  assert.equal(result.currentEnd, "2024-03-29");
  assert.equal(result.previousEnd, "2024-02-29");
  assert.equal(result.current - result.previous, 1_000);
});

test("split refunds reduce their original categories, never income, and debt principal remains outside insights", () => {
  const state = withHistory(fixture(), "2026-08-01");
  state.categories.push({
    ...state.categories[0],
    id: "delivery",
    name: "Доставка",
    parentId: "groceries",
    budget: 0,
  });
  state.transactions.push(
    transaction("purchase", "2026-08-10", 100, {
      splits: [
        { category: "groceries", amount: 60 },
        { category: "delivery", amount: 20 },
        { category: "shopping", amount: 20 },
      ],
    }),
    transaction("refund", "2026-09-10", 40, {
      type: "income",
      refundOf: "purchase",
    }),
    transaction("loan", "2026-09-10", 999_000, {
      type: "income",
      debtId: "debt",
      debtAction: "issue",
    }),
    transaction("repayment", "2026-09-12", 499_000, {
      debtId: "debt",
      debtAction: "repay",
    }),
  );
  const result = spendingComparison(state, "2026-09", TODAY);
  assert.equal(result.current, -40);
  assert.equal(result.previous, 100);
  const groceries = result.changes.find(
    (category) => category.categoryId === "groceries",
  )!;
  assert.equal(groceries.current, -32);
  assert.equal(groceries.previous, 80);
  assert.equal(groceries.currentTransactions.length, 1);
  assert.equal(groceries.currentTransactions[0].amount, -32);
  const overview = monthlyOverview(state, "2026-09", 3, TODAY).at(-1)!;
  assert.equal(overview.income, 0);
  assert.equal(overview.expense, -40);
});

test("short history and future periods never claim an evidence-based comparison", () => {
  const state = fixture();
  assert.equal(spendingComparison(state, "2026-09", TODAY).hasHistory, false);
  state.transactions.push(transaction("recent", "2026-09-01", 2_000));
  assert.equal(spendingComparison(state, "2026-09", TODAY).hasHistory, false);
  const future = spendingComparison(state, "2026-10", TODAY);
  assert.equal(future.hasHistory, false);
  assert.equal(future.days, 0);
  assert.equal(future.current, 0);
});

test("monthly overview distinguishes absent history, partial months and recorded zero months without including future entries", () => {
  const state = withHistory(fixture(), "2026-06-15");
  state.transactions.push(
    transaction("september", "2026-09-10", 3_000),
    transaction("future", "2026-09-25", 100_000),
  );
  const rows = monthlyOverview(state, "2026-09", 6, TODAY);
  assert.deepEqual(
    rows.map((row) => row.status),
    ["missing", "missing", "partial", "recorded", "recorded", "partial"],
  );
  assert.equal(rows[3].expense, 0);
  assert.equal(rows[3].count, 0);
  assert.equal(rows[5].expense, 3_000);
  assert.equal(
    monthlyOverview(state, "2026-09", 12, TODAY)[0].month,
    "2025-10",
  );
  assert.equal(
    monthlyOverview(state, "2026-10", 3, TODAY).at(-1)!.status,
    "future",
  );
});

test("daily spending estimate uses completed calendar days, excluding savings, transfers and known payments", () => {
  const state = withHistory(fixture(), "2026-09-01");
  state.recurring.push({
    id: "rent",
    name: "Аренда",
    amount: 300_000,
    day: 1,
    kind: "bill",
    active: true,
    icon: "home-outline",
    color: "#000",
    category: "home",
    accountId: "card",
  });
  for (const day of [2, 5, 10, 15, 20, 25])
    state.transactions.push(
      transaction(
        `everyday-${day}`,
        `2026-09-${String(day).padStart(2, "0")}`,
        3_000,
      ),
    );
  state.transactions.push(
    transaction("bill", "2026-09-01", 300_000, {
      title: "Аренда",
      recurringId: "rent",
      category: "home",
    }),
    transaction("matched-bill", "2026-09-15", 300_000, {
      title: "  АРЕНДА ",
      category: "home",
    }),
    transaction("transfer", "2026-09-10", 50_000, {
      type: "transfer",
      toAccountId: "savings",
    }),
    transaction("savings-spend", "2026-09-10", 80_000, {
      accountId: "savings",
    }),
    transaction("today", "2026-10-01", 90_000),
    transaction("future", "2026-10-02", 90_000),
  );
  const before = JSON.stringify(state);
  const result = dailySpendingEstimate(state, "2026-10-01");
  assert.equal(result.start, "2026-09-01");
  assert.equal(result.end, "2026-09-30");
  assert.equal(result.ready, true);
  assert.equal(result.days, 30);
  assert.equal(result.count, 6);
  assert.equal(result.total, 18_000);
  assert.equal(result.daily, 600);
  assert.equal(result.excludedPayments, 2);
  assert.equal(JSON.stringify(state), before);
});

test("a few large purchases or a week of history cannot create a daily forecast estimate", () => {
  const state = withHistory(fixture(), "2026-09-01");
  state.transactions.push(transaction("one", "2026-09-01", 99_999_999));
  assert.equal(dailySpendingEstimate(state, TODAY).daily, null);
  const recent = fixture();
  for (const day of [14, 15, 16, 17, 18, 19])
    recent.transactions.push(
      transaction(String(day), `2026-09-${day}`, 10_000),
    );
  assert.equal(dailySpendingEstimate(recent, TODAY).days, 6);
  assert.equal(dailySpendingEstimate(recent, TODAY).daily, null);
  assert.equal(dailySpendingEstimate(fixture(), TODAY).days, 0);
});

test("insights use saved historical currency valuations rather than today's exchange rates", () => {
  const state = withHistory(fixture(), "2026-08-01");
  state.accounts[0].currency = "USD";
  state.transactions[0].baseAmount = 0;
  state.transactions.push(
    transaction("previous", "2026-08-10", 100, { baseAmount: 9_000 }),
    transaction("current", "2026-09-10", 100, { baseAmount: 10_000 }),
  );
  const result = spendingComparison(state, "2026-09", TODAY);
  assert.equal(result.current - result.previous, 1_000);
  assert.equal(
    monthlyOverview(state, "2026-09", 3, TODAY).at(-1)!.expense,
    10_000,
  );
});

function subscriptionFixture() {
  const state = fixture();
  for (const [month, amount] of [
    ["07", 49_900],
    ["08", 50_000],
    ["09", 49_900],
  ] as const)
    state.transactions.push(
      transaction(month, `2026-${month}-15`, amount, {
        title: month === "08" ? "  СЕРВИС  " : "Сервис",
        category: "fun",
      }),
    );
  return state;
}

test("a repeated spending suggestion is explainable and does not create a plan or financial operation", () => {
  const state = subscriptionFixture();
  const before = JSON.stringify(state);
  const suggestions = recurringSuggestions(state, TODAY);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].transactionId, "09");
  assert.equal(suggestions[0].amount, 49_900);
  assert.deepEqual(
    suggestions[0].transactions.map((item) => item.date),
    ["2026-07-15", "2026-08-15", "2026-09-15"],
  );
  assert.equal(JSON.stringify(state), before);
});

test("repeat detection rejects daily merchants, changing prices, stale patterns and existing plans", () => {
  const multiple = subscriptionFixture();
  multiple.transactions.push(
    transaction("second-august", "2026-08-20", 49_900, {
      title: "Сервис",
      category: "fun",
    }),
  );
  assert.deepEqual(recurringSuggestions(multiple, TODAY), []);
  const variable = subscriptionFixture();
  variable.transactions[0].amount = 150_000;
  assert.deepEqual(recurringSuggestions(variable, TODAY), []);
  const planned = subscriptionFixture();
  planned.recurring.push({
    id: "service",
    name: "Сервис",
    amount: 100_000,
    day: 15,
    kind: "subscription",
    active: true,
    icon: "cloud-outline",
    color: "#000",
    category: "fun",
    accountId: "card",
  });
  assert.deepEqual(recurringSuggestions(planned, TODAY), []);
  assert.deepEqual(
    recurringSuggestions(subscriptionFixture(), "2026-11-20"),
    [],
  );
  const differentAccounts = subscriptionFixture();
  differentAccounts.transactions[0].accountId = "cash";
  assert.deepEqual(recurringSuggestions(differentAccounts, TODAY), []);
});
