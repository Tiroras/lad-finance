import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deletePlannedIncome,
  receivePlannedIncome,
} from "../src/domain/actions/incomes";
import { RATE_SCALE } from "../src/domain/currency";
import { simulatePurchase, spendable } from "../src/domain/finance";
import { createInitialState } from "../src/domain/seed";
import type { FinanceState, PlannedIncome } from "../src/domain/types";

const TODAY = "2026-09-10";
function fixture(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 100_000;
  return state;
}
function income(id: string, date: string, amount = 200_000): PlannedIncome {
  return { id, name: id, amount, date, repeat: "monthly", accountId: "card" };
}
function bill(state: FinanceState, day: number, amount: number) {
  state.recurring.push({
    id: "rent",
    name: "Аренда",
    day,
    amount,
    kind: "bill",
    active: true,
    category: "home",
    accountId: "card",
    icon: "home-outline",
    color: "#EEE",
    startsOn: TODAY,
  });
}

test("spendable follows the nearest unreceived income and never credits expected money", () => {
  const state = fixture();
  state.plannedIncomes = [
    income("Зарплата", "2026-09-05"),
    income("Аванс", "2026-09-20"),
  ];
  const safe = spendable(state, TODAY);
  assert.equal(safe.payday, "2026-09-20");
  assert.equal(safe.income?.plan.name, "Аванс");
  assert.equal(safe.days, 10);
  assert.equal(safe.liquid, 100_000);
  assert.equal(safe.available, 100_000);
  assert.equal(safe.daily, 10_000);
  assert.equal(state.transactions.length, 0);
});

test("a selected reliable income defines the period even when another income arrives earlier", () => {
  const state = fixture();
  state.plannedIncomes = [
    income("salary", "2026-09-05"),
    income("advance", "2026-09-20"),
  ];
  state.settings.spendableIncomeId = "salary";
  bill(state, 23, 70_000);
  const safe = spendable(state, TODAY);
  assert.equal(safe.payday, "2026-10-05");
  assert.equal(safe.income?.plan.id, "salary");
  assert.equal(safe.days, 25);
  assert.equal(safe.payments, 70_000);
  assert.equal(safe.available, 30_000);
});

test("same-day unreceived income keeps one day and today's pending bills reserved", () => {
  const state = fixture();
  state.plannedIncomes = [{ ...income("once", TODAY), repeat: "once" }];
  bill(state, 10, 20_000);
  const safe = spendable(state, TODAY);
  assert.equal(safe.payday, TODAY);
  assert.equal(safe.days, 1);
  assert.equal(safe.payments, 20_000);
  assert.equal(safe.available, 80_000);
  const next = receivePlannedIncome(state, "once", TODAY, TODAY);
  assert.equal(spendable(next, TODAY).income, undefined);
  assert.equal(spendable(next, TODAY).payday, "2026-09-25");
  assert.equal(spendable(next, TODAY).liquid, 300_000);
});

test("an early received monthly income is skipped until its next occurrence", () => {
  const state = fixture();
  state.plannedIncomes = [income("salary", "2026-09-20")];
  const next = receivePlannedIncome(state, "salary", "2026-09-20", TODAY);
  const safe = spendable(next, TODAY);
  assert.equal(safe.payday, "2026-10-20");
  assert.equal(safe.days, 40);
  assert.equal(safe.protection?.horizon, 60);
  assert.equal(safe.liquid, 300_000);
});

test("calendar clamps monthly income across leap February and year boundaries", () => {
  const state = fixture();
  state.plannedIncomes = [income("salary", "2024-01-31")];
  assert.equal(spendable(state, "2024-02-10").payday, "2024-02-29");
  assert.equal(spendable(state, "2026-02-10").payday, "2026-02-28");
  assert.equal(spendable(state, "2026-12-31").payday, "2026-12-31");
  const next = receivePlannedIncome(
    state,
    "salary",
    "2026-12-31",
    "2026-12-31",
  );
  assert.equal(spendable(next, "2026-12-31").payday, "2027-01-31");
});

test("without a future income plan the configured payday retains the legacy calculation", () => {
  const state = fixture();
  state.settings.payday = 31;
  const safe = spendable(state, "2024-02-10");
  assert.equal(safe.payday, "2024-02-29");
  assert.equal(safe.days, 19);
  assert.equal(safe.available, 100_000);
  assert.equal(safe.protection, undefined);
  state.plannedIncomes = [
    { ...income("distant", "2027-12-01"), repeat: "once" },
  ];
  state.settings.spendableIncomeId = "distant";
  assert.equal(spendable(state, TODAY).payday, "2026-09-30");
  assert.equal(spendable(state, TODAY).selectedIncomeUnavailable, true);
});

test("a small early income cannot hide a large bill before the next salary", () => {
  const state = fixture();
  state.plannedIncomes = [
    income("small", "2026-09-11", 1_000),
    income("salary", "2026-09-20"),
  ];
  bill(state, 15, 95_000);
  const snapshot = JSON.stringify(state);
  const safe = spendable(state, TODAY);
  assert.equal(safe.beforeProtection, 100_000);
  assert.equal(safe.available, 6_000);
  assert.equal(safe.daily, 6_000);
  assert.equal(safe.protectedAmount, 94_000);
  assert.equal(safe.protection?.date, "2026-09-15");
  assert.equal(simulatePurchase(state, 6_001, TODAY).shortfall, 1);
  assert.equal(simulatePurchase(state, 6_000, TODAY).affordable, true);
  assert.equal(JSON.stringify(state), snapshot);
});

test("a future deficit produces zero available money and an explicit shortfall", () => {
  const state = fixture();
  state.plannedIncomes = [
    income("small", "2026-09-11", 1_000),
    income("salary", "2026-09-20"),
  ];
  bill(state, 15, 110_000);
  const safe = spendable(state, TODAY);
  assert.equal(safe.raw, -9_000);
  assert.equal(safe.available, 0);
  assert.equal(safe.daily, 0);
});

test("forecast protection compares limits without reserving goals, bills or buffer twice", () => {
  const state = fixture();
  state.plannedIncomes = [income("salary", "2026-09-20")];
  state.settings.buffer = 5_000;
  state.goals = [
    {
      id: "goal",
      name: "Цель",
      target: 100_000,
      initialSaved: 0,
      monthly: 20_000,
      icon: "leaf-outline",
      color: "#EEE",
    },
  ];
  bill(state, 15, 10_000);
  const safe = spendable(state, TODAY);
  assert.equal(safe.goals, 20_000);
  assert.equal(safe.payments, 10_000);
  assert.equal(safe.available, 65_000);
  assert.equal(safe.protectedAmount, 0);
});

test("everyday spending is retained after the selected income, not counted twice before it", () => {
  const state = fixture();
  state.settings.forecast = { dailySpending: 2_000, goalDay: 31 };
  state.plannedIncomes = [
    { ...income("small", "2026-09-20", 1_000), repeat: "once" },
  ];
  const safe = spendable(state, TODAY);
  // Sep 20 through Oct 9: twenty days at 2,000, after a 1,000 income.
  assert.equal(safe.available, 61_000);
  assert.equal(safe.daily, 6_100);
  assert.equal(safe.protection?.dailyStart, "2026-09-20");
});

test("foreign income and bills use current account exchange rates only for projection", () => {
  const state = fixture();
  state.accounts.push({
    ...state.accounts[0],
    id: "usd",
    name: "USD",
    currency: "USD",
    openingBalance: 0,
  });
  state.settings.exchange = {
    automatic: false,
    rates: { USD: { value: 100 * RATE_SCALE, date: TODAY, source: "manual" } },
  };
  state.plannedIncomes = [
    { ...income("small", "2026-09-11", 100), accountId: "usd" },
    income("salary", "2026-09-20"),
  ];
  bill(state, 15, 900);
  state.recurring[0].accountId = "usd";
  const safe = spendable(state, TODAY);
  assert.equal(safe.liquid, 100_000);
  assert.equal(safe.available, 20_000);
  assert.equal(safe.protection?.date, "2026-09-15");
});

test("deleting the selected income clears the preference while preserving recorded money", () => {
  const state = fixture();
  state.plannedIncomes = [income("salary", "2026-09-20")];
  state.settings.spendableIncomeId = "salary";
  const received = receivePlannedIncome(state, "salary", "2026-09-20", TODAY);
  const next = deletePlannedIncome(received, "salary");
  assert.equal(next.settings.spendableIncomeId, undefined);
  assert.equal(next.transactions.length, 1);
  assert.equal(next.transactions[0].amount, 200_000);
  assert.equal(next.transactions[0].plannedIncomeId, undefined);
  assert.equal(state.settings.spendableIncomeId, "salary");
});
