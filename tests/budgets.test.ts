import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryBudget,
  budgetPeriod,
  validateBudgetPlans,
} from "../src/domain/budgets";
import {
  saveBudgetPlan,
  type BudgetPlanInput,
} from "../src/domain/actions/budgets";
import { createInitialState } from "../src/domain/seed";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import type { FinanceState } from "../src/domain/types";

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
