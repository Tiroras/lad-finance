import assert from "node:assert/strict";
import { test } from "node:test";
import { accountBalances } from "../src/domain/accountBalances";
import { categoryBudgets } from "../src/domain/budgets";
import { goalContributions } from "../src/domain/goals";
import { totals } from "../src/domain/finance";
import { monthlyOverview } from "../src/domain/insights";
import { incomeOccurrences, canLinkIncome } from "../src/domain/incomes";
import { canLinkPayment } from "../src/domain/payments";
import { payRecurring } from "../src/domain/actions/recurring";
import { createInitialState } from "../src/domain/seed";
import type {
  Transaction,
  Recurring,
  PlannedIncome,
} from "../src/domain/types";

const TODAY = "2026-09-10";
function transaction(
  id: string,
  fields: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    type: "expense",
    title: id,
    amount: 100,
    date: TODAY,
    category: "other",
    accountId: "card",
    ...fields,
  };
}

test("shared balances and goal contributions use actual received units and the requested cutoff", () => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000;
  state.transactions = [
    transaction("previous", {
      type: "transfer",
      amount: 100,
      toAmount: 7,
      toAccountId: "savings",
      goalId: "goal",
      date: "2026-08-31",
    }),
    transaction("current", {
      type: "transfer",
      amount: 200,
      toAmount: 13,
      toAccountId: "savings",
      goalId: "goal",
    }),
    transaction("future", {
      type: "transfer",
      amount: 300,
      toAmount: 17,
      toAccountId: "savings",
      goalId: "goal",
      date: "2026-09-11",
    }),
  ];
  state.balanceAdjustments = [
    { id: "now", accountId: "card", date: TODAY, amount: 50, note: "Сверка" },
    {
      id: "later",
      accountId: "card",
      date: "2026-09-11",
      amount: 500,
      note: "Будущая сверка",
    },
  ];
  const before = structuredClone(state);
  assert.equal(accountBalances(state, TODAY).get("card"), 750);
  assert.equal(accountBalances(state, TODAY).get("savings"), 20);
  assert.deepEqual(goalContributions(state, TODAY).get("goal"), {
    total: 20,
    month: 13,
  });
  assert.deepEqual(state, before);
});

test("monthly totals and insights share an explicit cutoff and exclude refunds and debt principal from income", () => {
  const state = createInitialState(false, TODAY);
  state.transactions = [
    transaction("purchase", {
      amount: 1_000,
      date: "2026-09-01",
      splits: [
        { category: "groceries", amount: 600 },
        { category: "home", amount: 400 },
      ],
    }),
    transaction("refund", {
      type: "income",
      amount: 250,
      refundOf: "purchase",
    }),
    transaction("salary", { type: "income", amount: 5_000 }),
    transaction("debt", {
      type: "income",
      amount: 8_000,
      debtId: "debt",
      debtAction: "issue",
    }),
    transaction("later", { type: "income", amount: 9_000, date: "2026-09-11" }),
  ];
  assert.deepEqual(totals(state, undefined, TODAY), {
    income: 5_000,
    expense: 750,
  });
  const month = monthlyOverview(state, "2026-09", 3, TODAY).at(-1)!;
  assert.equal(month.income, 5_000);
  assert.equal(month.expense, 750);
  assert.equal(month.end, TODAY);
  assert.deepEqual(totals(state, "2026-10", TODAY), { income: 0, expense: 0 });
});

test("all category budgets apportion split refunds once while retaining distinct periods and carry", () => {
  const state = createInitialState(false, TODAY);
  const home = state.categories.find((category) => category.id === "home")!;
  state.categories.push({
    ...home,
    id: "home-child",
    parentId: "home",
    budget: 0,
  });
  state.budgetPlans = [
    {
      categoryId: "home",
      period: "weekly",
      startDay: 1,
      anchor: "2026-09-01",
      rolloverSurplus: true,
      rolloverDeficit: false,
      changes: [{ from: "2000-01-01", amount: 1_000 }],
      overrides: [],
    },
  ];
  state.transactions = [
    transaction("purchase", {
      date: "2026-09-02",
      amount: 1_000,
      splits: [
        { category: "groceries", amount: 600 },
        { category: "home-child", amount: 400 },
      ],
    }),
    transaction("refund", {
      date: "2026-09-09",
      type: "income",
      amount: 250,
      refundOf: "purchase",
    }),
    transaction("house", { amount: 200, category: "home" }),
    transaction("future", {
      date: "2026-09-11",
      amount: 500,
      category: "home",
    }),
  ];
  const budgets = categoryBudgets(state, TODAY, TODAY);
  const groceries = budgets.find((budget) => budget.id === "groceries")!;
  const weekly = budgets.find((budget) => budget.id === "home")!;
  assert.equal(groceries.start, "2026-09-01");
  assert.equal(groceries.spent, 450);
  assert.equal(weekly.start, "2026-09-08");
  assert.equal(weekly.spent, 100);
  assert.equal(weekly.carried, 600);
  assert.equal(weekly.budget, 1_600);
  assert.equal(
    budgets.some((budget) => budget.id === "home-child"),
    false,
  );
});

test("receipt indexes retain once/month/date identities and ignore receipts after asOf", () => {
  const state = createInitialState(false, TODAY);
  state.plannedIncomes = [
    {
      id: "monthly",
      name: "Месяц",
      date: "2026-09-05",
      repeat: "monthly",
      amount: 100,
      accountId: "card",
    },
    {
      id: "weekly",
      name: "Неделя",
      date: "2026-09-01",
      repeat: "monthly",
      amount: 100,
      accountId: "card",
      schedule: { unit: "week", interval: 1, anchor: "2026-09-01" },
    },
    {
      id: "once",
      name: "Разовый",
      date: "2026-09-03",
      repeat: "once",
      amount: 100,
      accountId: "card",
    },
  ];
  state.transactions = [
    transaction("month-received", {
      type: "income",
      date: "2026-09-04",
      plannedIncomeId: "monthly",
      incomeOccurrenceDate: "2026-09-08",
    }),
    transaction("week-received", {
      type: "income",
      date: "2026-09-03",
      plannedIncomeId: "weekly",
      incomeOccurrenceDate: "2026-09-08",
    }),
    transaction("once-received", {
      type: "income",
      date: "2026-09-04",
      plannedIncomeId: "once",
      incomeOccurrenceDate: "2026-09-03",
    }),
    transaction("future-receipt", {
      type: "income",
      date: "2026-09-12",
      plannedIncomeId: "weekly",
      incomeOccurrenceDate: "2026-09-15",
    }),
  ];
  assert.deepEqual(
    incomeOccurrences(state, "2026-09-01", "2026-10-01", TODAY).map(
      ({ plan, date }) => [plan.id, date],
    ),
    [
      ["weekly", "2026-09-01"],
      ["weekly", "2026-09-15"],
      ["weekly", "2026-09-22"],
      ["weekly", "2026-09-29"],
    ],
  );
  assert.equal(
    incomeOccurrences(state, "2026-09-01", "2026-10-01", "2026-09-02").length,
    7,
  );
});

test("receipt candidates exclude debt movements and refunds and the action uses the same payment rule", () => {
  const payment: Recurring = {
    id: "bill",
    name: "Счёт",
    amount: 100,
    day: 10,
    kind: "bill",
    active: true,
    accountId: "card",
    category: "other",
    icon: "home-outline",
    color: "#EAF0E8",
    startsOn: "2026-09-01",
  };
  const income: PlannedIncome = {
    id: "income",
    name: "Доход",
    amount: 100,
    date: TODAY,
    repeat: "once",
    accountId: "card",
  };
  const debt = transaction("debt", { debtId: "debt", debtAction: "repay" });
  assert.equal(
    canLinkPayment(transaction("expense"), payment, TODAY, TODAY),
    true,
  );
  assert.equal(canLinkPayment(debt, payment, TODAY, TODAY), false);
  assert.equal(
    canLinkPayment(
      transaction("old", { date: "2026-08-31" }),
      payment,
      TODAY,
      TODAY,
    ),
    false,
  );
  assert.equal(
    canLinkIncome(
      transaction("early", { type: "income", date: "2026-08-31" }),
      income,
      TODAY,
    ),
    true,
  );
  assert.equal(
    canLinkIncome(
      transaction("refund", { type: "income", refundOf: "purchase" }),
      income,
      TODAY,
    ),
    false,
  );
  assert.equal(
    canLinkIncome({ ...debt, type: "income" }, income, TODAY),
    false,
  );
  const state = createInitialState(false, TODAY);
  state.recurring = [payment];
  state.transactions = [debt];
  assert.throws(
    () => payRecurring(state, payment.id, TODAY, TODAY, debt.id),
    /больше не подходит/,
  );
});
