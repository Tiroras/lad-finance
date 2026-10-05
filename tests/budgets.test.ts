import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryBudget,
  budgetPeriod,
  budgetActivity,
  categoryBudgets,
  type BudgetPlan,
  validateBudgetPlans,
} from "../src/domain/budgets";
import {
  saveBudgetPlan,
  type BudgetPlanInput,
} from "../src/domain/actions/budgets";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import type { FinanceState } from "../src/domain/types";
import { RATE_SCALE } from "../src/domain/currency";

const TODAY = "2026-09-10";
function fixture() {
  const state = createInitialState(false, TODAY);
  state.categories.find((c) => c.id === "groceries")!.budget = 10_000;
  state.accounts[0].openingBalance = 100_000;
  return state;
}
function input(fields: Partial<BudgetPlanInput> = {}): BudgetPlanInput {
  return {
    categoryId: "groceries",
    period: "monthly",
    startDay: 1,
    anchor: "2026-09-01",
    rolloverSurplus: false,
    rolloverDeficit: false,
    date: TODAY,
    amount: 12_000,
    onlyThisPeriod: false,
    ...fields,
  };
}
function expense(state: FinanceState, date: string, amount: number) {
  state.transactions.push({
    id: `expense-${date}`,
    type: "expense",
    title: "Продукты",
    amount,
    date,
    category: "groceries",
    accountId: "card",
  });
}

test("future and one-period limits leave closed months and default future amounts intact", () => {
  const original = fixture();
  const september = saveBudgetPlan(original, input(), TODAY);
  const october = saveBudgetPlan(
    september,
    input({ date: "2026-10-10", amount: 20_000, onlyThisPeriod: true }),
    TODAY,
  );
  assert.equal(
    categoryBudget(october, "groceries", "2026-08-10", TODAY).base,
    10_000,
  );
  assert.equal(categoryBudget(october, "groceries", TODAY, TODAY).base, 12_000);
  assert.equal(
    categoryBudget(october, "groceries", "2026-10-10", TODAY).base,
    20_000,
  );
  assert.equal(
    categoryBudget(october, "groceries", "2026-11-10", TODAY).base,
    12_000,
  );
  assert.equal(original.budgetPlans, undefined);
  assert.throws(
    () => saveBudgetPlan(october, input({ date: "2026-08-10" }), TODAY),
    /Закрытый/,
  );
  assert.deepEqual(
    decodeBackup(encodeBackup(october)).budgetPlans,
    october.budgetPlans,
  );
});
test("changing a future recurring limit preserves previous periods and explicit overrides", () => {
  let state = saveBudgetPlan(fixture(), input(), TODAY);
  state = saveBudgetPlan(
    state,
    input({ date: "2026-12-05", amount: 50_000, onlyThisPeriod: true }),
    TODAY,
  );
  state = saveBudgetPlan(
    state,
    input({ date: "2026-11-05", amount: 15_000 }),
    TODAY,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-10-01", TODAY).base,
    12_000,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-11-01", TODAY).base,
    15_000,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-12-01", TODAY).base,
    50_000,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2027-01-01", TODAY).base,
    15_000,
  );
});
test("positive balance and deficit rollovers can be enabled separately", () => {
  const original = fixture();
  expense(original, "2026-09-15", 7_000);
  let state = saveBudgetPlan(
    original,
    input({ rolloverSurplus: true, amount: 10_000 }),
    TODAY,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-10-10", "2026-10-10").budget,
    13_000,
  );
  expense(state, "2026-10-15", 15_000);
  assert.equal(
    categoryBudget(state, "groceries", "2026-11-10", "2026-11-10").budget,
    10_000,
  );
  const deficitState = fixture();
  expense(deficitState, "2026-09-15", 14_000);
  state = saveBudgetPlan(
    deficitState,
    input({ rolloverDeficit: true, amount: 10_000 }),
    TODAY,
  );
  const october = categoryBudget(
    state,
    "groceries",
    "2026-10-10",
    "2026-10-10",
  );
  assert.equal(october.carried, -4_000);
  assert.equal(october.budget, 6_000);
});
test("large overspend remains carried even when the displayed budget is zero", () => {
  let state = fixture();
  expense(state, "2026-09-15", 35_000);
  state = saveBudgetPlan(
    state,
    input({ rolloverDeficit: true, amount: 10_000 }),
    TODAY,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-10-10", "2026-10-10").budget,
    0,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-11-10", "2026-11-10").carried,
    -15_000,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-12-10", "2026-12-10").budget,
    5_000,
  );
});
test("payday-based monthly periods clamp February and restore the original day", () => {
  const plan = {
    period: "monthly" as const,
    startDay: 31,
    anchor: "2024-01-31",
  };
  assert.deepEqual(budgetPeriod(plan, "2024-02-28"), {
    start: "2024-01-31",
    end: "2024-02-29",
  });
  assert.deepEqual(budgetPeriod(plan, "2024-03-01"), {
    start: "2024-02-29",
    end: "2024-03-31",
  });
  assert.deepEqual(
    budgetPeriod({ ...plan, startDay: 25, anchor: "2026-08-25" }, TODAY),
    { start: "2026-08-25", end: "2026-09-25" },
  );
});
test("weekly and annual budget periods assign spending to the correct dates", () => {
  const original = fixture();
  expense(original, "2026-09-09", 500);
  expense(original, "2026-09-10", 700);
  expense(original, "2026-09-11", 900);
  const state = saveBudgetPlan(
    original,
    input({ period: "weekly", anchor: TODAY }),
    TODAY,
  );
  assert.equal(categoryBudget(state, "groceries", TODAY, TODAY).spent, 700);
  assert.equal(
    categoryBudget(state, "groceries", TODAY, "2026-09-11").spent,
    1_600,
  );
  assert.deepEqual(
    budgetPeriod(
      { period: "yearly", startDay: 1, anchor: "2024-02-29" },
      "2025-03-01",
    ),
    { start: "2025-02-28", end: "2026-02-28" },
  );
});
test("subcategory split amounts and refunds change carry without counting transfers as spending", () => {
  const original = fixture();
  original.categories.push({
    ...original.categories[0],
    id: "fruit",
    name: "Фрукты",
    parentId: "groceries",
    budget: 0,
  });
  original.transactions.push({
    id: "split",
    type: "expense",
    title: "Чек",
    amount: 8_000,
    baseAmount: 8_000,
    date: "2026-09-10",
    category: "groceries",
    accountId: "card",
    splits: [
      { category: "fruit", amount: 5_000 },
      { category: "home", amount: 3_000 },
    ],
  });
  original.transactions.push({
    id: "refund",
    type: "income",
    title: "Возврат",
    amount: 4_000,
    baseAmount: 4_000,
    date: "2026-09-15",
    category: "groceries",
    accountId: "card",
    refundOf: "split",
    refundSourceAmount: 4_000,
  });
  const state = saveBudgetPlan(
    original,
    input({ rolloverSurplus: true, amount: 10_000 }),
    TODAY,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-09-15", "2026-09-15").spent,
    2_500,
  );
  assert.equal(
    categoryBudget(state, "groceries", "2026-10-10", "2026-10-10").budget,
    17_500,
  );
});
test("once-created cadence and rollover history cannot be silently rewritten", () => {
  const state = saveBudgetPlan(fixture(), input(), TODAY);
  assert.throws(
    () => saveBudgetPlan(state, input({ rolloverSurplus: true }), TODAY),
    /График/,
  );
  assert.throws(
    () => saveBudgetPlan(state, input({ period: "weekly" }), TODAY),
    /График/,
  );
  const damaged = structuredClone(state);
  damaged.budgetPlans![0].overrides = [{ start: "2026-10-15", amount: 100 }];
  assert.throws(() => validateBudgetPlans(damaged), /лимит отдельного/);
});

test("starting a budget must not invent completed periods and rollover before setup", () => {
  assert.throws(
    () =>
      saveBudgetPlan(
        fixture(),
        input({
          period: "weekly",
          anchor: "2026-09-03",
          rolloverSurplus: true,
        }),
        TODAY,
      ),
    /текущего периода/,
  );
});

test("budget activity matches exact monthly, weekly, annual and short-month boundaries", () => {
  const cases: {
    plan?: Pick<BudgetPlan, "period" | "startDay" | "anchor">;
    date: string;
    start: string;
    end: string;
  }[] = [
    { date: "2026-09-10", start: "2026-09-01", end: "2026-10-01" },
    {
      plan: { period: "weekly", anchor: "2026-09-10", startDay: 1 },
      date: "2026-09-10",
      start: "2026-09-10",
      end: "2026-09-17",
    },
    {
      plan: { period: "yearly", anchor: "2024-02-29", startDay: 1 },
      date: "2025-03-01",
      start: "2025-02-28",
      end: "2026-02-28",
    },
    {
      plan: { period: "monthly", anchor: "2024-01-31", startDay: 31 },
      date: "2024-03-01",
      start: "2024-02-29",
      end: "2024-03-31",
    },
  ];
  for (const entry of cases) {
    const state = fixture();
    if (entry.plan)
      state.budgetPlans = [
        {
          ...entry.plan,
          categoryId: "groceries",
          rolloverSurplus: false,
          rolloverDeficit: false,
          changes: [{ from: "2000-01-01", amount: 10_000 }],
          overrides: [],
        },
      ];
    expense(state, entry.start, 123);
    expense(state, entry.end, 456);
    const activity = budgetActivity(state, "groceries", entry.date, entry.end);
    assert.deepEqual([activity.start, activity.end], [entry.start, entry.end]);
    assert.equal(activity.spent, 123);
    assert.deepEqual(
      activity.transactions.map((t) => t.date),
      [entry.start],
    );
    assert.equal(
      activity.spent,
      categoryBudget(state, "groceries", entry.date, entry.end).spent,
    );
  }
});

test("budget activity aggregates sibling splits once and values refunds on their credited dates using full history", () => {
  const state = fixture();
  for (const id of ["fruit", "vegetables"])
    state.categories.push({
      ...state.categories[0],
      id,
      name: id,
      parentId: "groceries",
      budget: 0,
    });
  state.transactions.push(
    {
      id: "old-purchase",
      type: "expense",
      title: "Прошлый чек",
      accountId: "card",
      date: "2026-08-31",
      category: "groceries",
      amount: 100,
      baseAmount: 100,
      splits: [
        { category: "fruit", amount: 20 },
        { category: "vegetables", amount: 50 },
        { category: "home", amount: 30 },
      ],
    },
    {
      id: "new-purchase",
      type: "expense",
      title: "Новый чек",
      accountId: "card",
      date: TODAY,
      category: "groceries",
      amount: 100,
      baseAmount: 100,
      splits: [
        { category: "fruit", amount: 20 },
        { category: "vegetables", amount: 50 },
        { category: "home", amount: 30 },
      ],
    },
  );
  for (const [id, date, amount] of [
    ["prior-refund", "2026-08-31", 10],
    ["current-refund", TODAY, 50],
    ["future-refund", "2026-09-11", 40],
  ] as const)
    state.transactions.push({
      id,
      date,
      amount,
      baseAmount: amount,
      type: "income",
      title: "Возврат прошлого чека",
      category: "other",
      accountId: "card",
      refundOf: "old-purchase",
    });
  const before = structuredClone(state);
  const activity = budgetActivity(state, "groceries", TODAY, TODAY);
  assert.deepEqual(
    activity.transactions.map((t) => [
      t.transactionId,
      t.amount,
      t.totalAmount,
      t.refund,
    ]),
    [
      ["current-refund", -35, 50, true],
      ["new-purchase", 70, 100, false],
    ],
  );
  assert.equal(activity.spent, 35);
  assert.equal(
    activity.spent,
    categoryBudget(state, "groceries", TODAY, TODAY).spent,
  );
  assert.deepEqual(state, before);
});

test("budget activity preserves historical currency valuations and excludes future, transfer, income and debt records", () => {
  const state = fixture();
  state.accounts.push({ ...state.accounts[0], id: "usd", currency: "USD" });
  state.settings.exchange = {
    automatic: false,
    rates: { USD: { value: 110 * RATE_SCALE, date: TODAY, source: "manual" } },
  };
  state.transactions.push({
    id: "foreign",
    type: "expense",
    date: TODAY,
    title: "Покупка USD",
    amount: 100,
    baseAmount: 9_001,
    accountId: "usd",
    category: "groceries",
  });
  for (const type of ["income", "transfer"] as const)
    state.transactions.push({
      id: type,
      type,
      date: TODAY,
      title: type,
      amount: 500,
      category: "groceries",
      accountId: "card",
      toAccountId: type === "transfer" ? "cash" : undefined,
    });
  state.transactions.push({
    id: "debt",
    type: "expense",
    date: TODAY,
    title: "Основная сумма долга",
    amount: 500,
    category: "groceries",
    accountId: "card",
    debtId: "debt-1",
    debtAction: "issue",
  });
  expense(state, "2026-09-11", 500);
  const activity = budgetActivity(state, "groceries", TODAY, TODAY);
  assert.deepEqual(
    activity.transactions.map((t) => [t.transactionId, t.amount]),
    [["foreign", 9_001]],
  );
  assert.equal(
    activity.spent,
    categoryBudget(state, "groceries", TODAY, TODAY).spent,
  );
});

test("archived budgets keep evidence after a full refund, while empty budgets have none", () => {
  const state = fixture();
  state.categories.find((c) => c.id === "groceries")!.archived = true;
  expense(state, TODAY, 101);
  state.transactions.push({
    id: "refund",
    type: "income",
    title: "Полный возврат",
    date: TODAY,
    amount: 101,
    accountId: "card",
    category: "other",
    refundOf: `expense-${TODAY}`,
  });
  const activity = budgetActivity(state, "groceries", TODAY, TODAY);
  assert.equal(activity.spent, 0);
  assert.equal(activity.transactions.length, 2);
  assert.equal(
    categoryBudgets(state, TODAY, TODAY).find((c) => c.id === "groceries")!
      .hasActivity,
    true,
  );
  assert.deepEqual(
    budgetActivity(state, "home", TODAY, TODAY).transactions,
    [],
  );
  assert.equal(categoryBudget(state, "home", TODAY, TODAY).hasActivity, false);
});

test("budget evidence follows edits and removals without losing the selected category period", () => {
  let state = fixture();
  expense(state, TODAY, 101);
  state = saveBudgetPlan(
    state,
    input({ period: "weekly", anchor: TODAY }),
    TODAY,
  );
  const current = () => budgetActivity(state, "groceries", TODAY, TODAY);
  assert.equal(current().spent, 101);
  state.transactions = state.transactions.map((t) => ({ ...t, amount: 202 }));
  assert.equal(current().spent, 202);
  state.transactions = state.transactions.map((t) => ({
    ...t,
    category: "home",
  }));
  assert.deepEqual(current().transactions, []);
  state.transactions = [];
  assert.deepEqual(
    [current().start, current().end, current().spent],
    [TODAY, "2026-09-17", 0],
  );
});
