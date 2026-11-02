import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createInitialState } from "../../../../src/domain/seed.ts";
import {
  saveTransaction,
  exchangeWithFee,
} from "../../../../src/domain/actions/transactions.ts";
import {
  fundGoal,
  withdrawGoal,
} from "../../../../src/domain/actions/goals.ts";
import { reconcileAccount } from "../../../../src/domain/actions/reconciliation.ts";
import {
  saveScenario,
  copyScenario,
} from "../../../../src/domain/actions/scenarios.ts";
import {
  accountBalance,
  accountBalances,
} from "../../../../src/domain/accountBalances.ts";
import {
  accountSignature,
  reconciliationCurrent,
} from "../../../../src/domain/reconciliation.ts";
import { goalSaved } from "../../../../src/domain/goals.ts";
import { expenseContributions } from "../../../../src/domain/transactionAmounts.ts";
import {
  totals,
  spendable,
  simulatePurchase,
} from "../../../../src/domain/finance.ts";
import { RATE_SCALE } from "../../../../src/domain/currency.ts";
import { forecast } from "../../../../src/domain/forecast.ts";
import { planPurchase } from "../../../../src/domain/purchasePlanner.ts";
import type {
  FinanceState,
  SavedScenario,
} from "../../../../src/domain/types.ts";

const TODAY = "2026-10-20";
const RUB = (value: number) => Math.round(value * 100);
const report: Record<string, unknown> = {};
let assertions = 0;
function equal(a: unknown, b: unknown) {
  assert.deepEqual(a, b);
  assertions++;
}
function immutable<T>(state: FinanceState, operation: () => T): T {
  const before = structuredClone(state);
  const result = operation();
  equal(state, before);
  return result;
}
function rejected(
  state: FinanceState,
  operation: () => unknown,
  expected: RegExp,
): string {
  const before = structuredClone(state);
  let message = "";
  try {
    operation();
  } catch (error) {
    message = (error as Error).message;
  }
  assert.match(message, expected);
  assertions++;
  equal(state, before);
  return message;
}
function initial(date = TODAY): FinanceState {
  const state = createInitialState(false, date);
  state.version = 9;
  return state;
}
function balances(state: FinanceState, date: string) {
  return Object.fromEntries(accountBalances(state, date));
}
function currentReconcile(
  state: FinanceState,
  balance: number,
  date: string,
  adjust: boolean,
) {
  return reconcileAccount(
    state,
    {
      accountId: "card",
      date,
      balance,
      adjust,
      note: adjust ? "Уточнение фактического остатка" : "Сумма совпадает",
      expectedSignature: accountSignature(state, "card", date),
    },
    date,
  );
}

// UC-01: one split purchase, proportional refund, failed inconsistent split.
{
  const state = initial();
  state.accounts[0].openingBalance = RUB(10000);
  const purchase = {
    createId: "purchase",
    type: "expense" as const,
    title: "Покупка",
    amount: RUB(1250),
    date: TODAY,
    accountId: "card",
    category: "groceries",
    splits: [
      { category: "groceries", amount: RUB(1000) },
      { category: "home", amount: RUB(250) },
    ],
  };
  const bought = immutable(state, () =>
    saveTransaction(state, purchase, TODAY),
  );
  equal(accountBalance(bought, "card", TODAY), RUB(8750));
  equal(bought.transactions.length, 1);
  const returned = immutable(bought, () =>
    saveTransaction(
      bought,
      {
        createId: "refund",
        type: "income",
        title: "Возврат",
        amount: RUB(250),
        date: "2026-10-21",
        accountId: "card",
        category: "groceries",
        refundOf: "purchase",
      },
      "2026-10-21",
    ),
  );
  const contributions: Record<string, number> = {};
  for (const transaction of returned.transactions)
    for (const part of expenseContributions(returned, transaction))
      contributions[part.category] =
        (contributions[part.category] ?? 0) + part.amount;
  equal(contributions, { groceries: RUB(800), home: RUB(200) });
  equal(accountBalance(returned, "card", "2026-10-21"), RUB(9000));
  equal(totals(returned, "2026-10", "2026-10-21"), {
    income: 0,
    expense: RUB(1000),
  });
  const error = rejected(
    state,
    () =>
      saveTransaction(
        state,
        {
          ...purchase,
          splits: [purchase.splits[0], { category: "home", amount: RUB(200) }],
        },
        TODAY,
      ),
    /Сумма частей/,
  );
  report["UC-01"] = {
    purchaseBalance: RUB(8750),
    refundBalance: RUB(9000),
    contributions,
    totals: totals(returned, "2026-10", "2026-10-21"),
    invalidSplitError: error,
    inputUnchanged: true,
  };
}

// UC-02: exchange and fee are committed atomically.
{
  const state = initial();
  state.accounts = [
    { ...state.accounts[0], openingBalance: RUB(20000) },
    {
      ...state.accounts[0],
      id: "usd",
      name: "Долларовый",
      currency: "USD",
      openingBalance: 0,
    },
  ];
  state.settings.exchange = {
    automatic: false,
    rates: { USD: { value: 90 * RATE_SCALE, date: TODAY, source: "manual" } },
  };
  const input = {
    transfer: {
      createId: "exchange",
      type: "transfer" as const,
      title: "Обмен",
      amount: RUB(9000),
      toAmount: 10000,
      date: TODAY,
      accountId: "card",
      toAccountId: "usd",
      category: "groceries",
    },
    feeAmount: RUB(100),
    feeAccountId: "card",
    feeCategory: "other",
  };
  const exchanged = immutable(state, () =>
    exchangeWithFee(state, input, TODAY),
  );
  equal(balances(exchanged, TODAY), { card: RUB(10900), usd: 10000 });
  equal(exchanged.transactions.length, 2);
  equal(totals(exchanged, "2026-10", TODAY), { income: 0, expense: RUB(100) });
  const archived = structuredClone(state);
  archived.categories.find((c) => c.id === "other")!.archived = true;
  const error = rejected(
    archived,
    () => exchangeWithFee(archived, input, TODAY),
    /Категория в архиве/,
  );
  equal(archived.transactions.length, 0);
  report["UC-02"] = {
    balances: balances(exchanged, TODAY),
    totals: totals(exchanged, "2026-10", TODAY),
    transactions: exchanged.transactions.length,
    archivedFeeError: error,
    inputUnchanged: true,
  };
}

// UC-03 and UC-04 share the documented consecutive history.
let funded: FinanceState;
{
  const state = initial();
  state.accounts[0].openingBalance = RUB(10000);
  state.accounts.find((a) => a.id === "savings")!.openingBalance = RUB(2000);
  state.goals = [
    {
      id: "trip",
      name: "Поездка",
      target: RUB(5000),
      initialSaved: RUB(1000),
      monthly: 0,
      icon: "airplane-outline",
      color: "#FFFFFF",
    },
    {
      id: "reserve",
      name: "Другая цель",
      target: RUB(2000),
      initialSaved: RUB(500),
      monthly: 0,
      icon: "shield-checkmark-outline",
      color: "#FFFFFF",
    },
  ];
  funded = immutable(state, () =>
    fundGoal(
      state,
      {
        goalId: "trip",
        amount: RUB(1500),
        accountId: "card",
        toAccountId: "savings",
      },
      TODAY,
    ),
  );
  equal(accountBalance(funded, "card", TODAY), RUB(8500));
  equal(accountBalance(funded, "savings", TODAY), RUB(3500));
  equal(goalSaved(funded, funded.goals[0], TODAY), RUB(2500));
  equal(goalSaved(funded, funded.goals[1], TODAY), RUB(500));
  equal(totals(funded, "2026-10", TODAY), { income: 0, expense: 0 });
  equal(funded.transactions.length, 1);
  const error = rejected(
    funded,
    () =>
      fundGoal(
        funded,
        {
          goalId: "trip",
          amount: RUB(3000),
          accountId: "card",
          toAccountId: "savings",
        },
        TODAY,
      ),
    /цели|цель/,
  );
  report["UC-03"] = {
    balances: balances(funded, TODAY),
    tripSaved: goalSaved(funded, funded.goals[0], TODAY),
    otherSaved: goalSaved(funded, funded.goals[1], TODAY),
    excessiveContributionError: error,
    inputUnchanged: true,
  };
}
{
  const date = "2026-10-21";
  const withdrawn = immutable(funded, () =>
    withdrawGoal(
      funded,
      {
        goalId: "trip",
        amount: RUB(700),
        accountId: "savings",
        toAccountId: "card",
      },
      date,
    ),
  );
  equal(accountBalance(withdrawn, "card", date), RUB(9200));
  equal(accountBalance(withdrawn, "savings", date), RUB(2800));
  equal(goalSaved(withdrawn, withdrawn.goals[0], date), RUB(1800));
  equal(goalSaved(withdrawn, withdrawn.goals[0], TODAY), RUB(2500));
  equal(goalSaved(withdrawn, withdrawn.goals[1], date), RUB(500));
  equal(withdrawn.goalReleases!.length, 1);
  equal(withdrawn.goalReleases![0].amount, RUB(700));
  equal(withdrawn.transactions.length, 2);
  assert.ok(
    withdrawn.transactions.some(
      (t) =>
        t.id === withdrawn.goalReleases![0].transferId && t.amount === RUB(700),
    ),
  );
  assertions++;
  const error = rejected(
    withdrawn,
    () =>
      withdrawGoal(
        withdrawn,
        {
          goalId: "trip",
          amount: RUB(1900),
          accountId: "savings",
          toAccountId: "card",
        },
        date,
      ),
    /больше, чем накоплено/,
  );
  report["UC-04"] = {
    balances: balances(withdrawn, date),
    tripSaved: RUB(1800),
    historicTripSaved: RUB(2500),
    releaseCount: 1,
    transferLinked: true,
    excessiveWithdrawalError: error,
    inputUnchanged: true,
  };
}

// UC-05: a matching reconciliation becomes stale after a monetary edit.
{
  const date = "2026-09-10";
  let state = initial(date);
  state.accounts[0].openingBalance = RUB(10000);
  state.accounts.find((a) => a.id === "cash")!.openingBalance = RUB(500);
  for (const input of [
    {
      createId: "income",
      type: "income" as const,
      title: "Доход",
      amount: RUB(2000),
      date: "2026-09-07",
      accountId: "card",
      category: "other",
    },
    {
      createId: "expense",
      type: "expense" as const,
      title: "Расход",
      amount: RUB(3000),
      date: "2026-09-08",
      accountId: "card",
      category: "groceries",
    },
    {
      createId: "transfer",
      type: "transfer" as const,
      title: "Перевод",
      amount: RUB(500),
      date: "2026-09-09",
      accountId: "cash",
      toAccountId: "card",
      category: "other",
    },
  ])
    state = saveTransaction(state, input, date);
  equal(accountBalance(state, "card", date), RUB(9500));
  const reconciled = immutable(state, () =>
    currentReconcile(state, RUB(9500), date, false),
  );
  equal(reconciled.balanceAdjustments?.length ?? 0, 0);
  equal(reconciled.reconciliations!.length, 1);
  equal(
    reconciliationCurrent(reconciled, reconciled.reconciliations![0]),
    true,
  );
  const edited = immutable(reconciled, () =>
    saveTransaction(
      reconciled,
      {
        ...reconciled.transactions.find((t) => t.id === "expense")!,
        amount: RUB(3200),
      },
      date,
    ),
  );
  equal(accountBalance(edited, "card", date), RUB(9300));
  equal(reconciliationCurrent(edited, edited.reconciliations![0]), false);
  report["UC-05"] = {
    reconciledBalance: RUB(9500),
    adjustmentCount: 0,
    reconciliationCurrentBeforeEdit: true,
    balanceAfterEdit: RUB(9300),
    reconciliationCurrentAfterEdit: false,
    inputUnchanged: true,
  };
}

// UC-06: dated correction, repeat confirmation, stale signature rejection.
{
  const date = "2026-09-10";
  const state = initial(date);
  state.accounts[0].openingBalance = RUB(10000);
  const corrected = immutable(state, () =>
    currentReconcile(state, 987655, date, true),
  );
  equal(corrected.balanceAdjustments![0].amount, -12345);
  equal(accountBalance(corrected, "card", "2026-09-09"), RUB(10000));
  equal(accountBalance(corrected, "card", date), 987655);
  equal(corrected.accounts[0].openingBalance, RUB(10000));
  equal(corrected.transactions.length, 0);
  equal(totals(corrected, "2026-09", date), { income: 0, expense: 0 });
  const again = immutable(corrected, () =>
    currentReconcile(corrected, 987655, date, true),
  );
  equal(again.balanceAdjustments!.length, 1);
  equal(again.reconciliations!.length, 2);
  const staleSignature = accountSignature(state, "card", date);
  const error = rejected(
    corrected,
    () =>
      reconcileAccount(
        corrected,
        {
          accountId: "card",
          date,
          balance: 987655,
          note: "Повтор",
          adjust: true,
          expectedSignature: staleSignature,
        },
        date,
      ),
    /Операции изменились/,
  );
  report["UC-06"] = {
    adjustment: -12345,
    balanceBeforeDate: RUB(10000),
    balanceAtDate: 987655,
    openingBalance: RUB(10000),
    transactions: 0,
    adjustmentsAfterRepeat: 1,
    reconciliationsAfterRepeat: 2,
    staleSignatureError: error,
    inputUnchanged: true,
  };
}

function forecastFixture(): FinanceState {
  const state = initial();
  state.accounts = [
    {
      ...state.accounts[0],
      id: "A",
      name: "Счёт A",
      openingBalance: RUB(30000),
    },
    {
      ...state.accounts[0],
      id: "B",
      name: "Счёт B",
      openingBalance: RUB(10000),
    },
    {
      ...state.accounts[2],
      id: "S",
      name: "Счёт S",
      openingBalance: RUB(50000),
    },
  ];
  state.settings.buffer = RUB(5000);
  state.settings.forecast = {
    dailySpending: RUB(500),
    dailyAccountId: "A",
    goalDay: 31,
  };
  state.plannedIncomes = [
    {
      id: "income",
      name: "Доход",
      amount: RUB(10000),
      date: "2026-10-25",
      repeat: "once",
      accountId: "A",
    },
  ];
  state.recurring = [
    {
      id: "payment",
      name: "Платёж",
      amount: RUB(18000),
      day: 28,
      startsOn: TODAY,
      active: true,
      kind: "bill",
      accountId: "A",
      category: "home",
      icon: "home-outline",
      color: "#FFFFFF",
    },
  ];
  return state;
}
const base = forecastFixture();
const projection = immutable(base, () => forecast(base, 30, TODAY));
{
  const expectedDays = {
    "2026-10-20": 40000,
    "2026-10-24": 38000,
    "2026-10-25": 47500,
    "2026-10-27": 46500,
    "2026-10-28": 28000,
    "2026-11-18": 17500,
  };
  for (const [date, value] of Object.entries(expectedDays))
    equal(projection.days.find((d) => d.date === date)!.available, RUB(value));
  equal(projection.minimum.available, RUB(17500));
  equal(projection.minimum.date, "2026-11-18");
  equal(projection.days.length, 30);
  equal(
    projection.days.flatMap((d) => d.events).filter((e) => e.type === "daily")
      .length,
    29,
  );
  equal(
    projection.accounts.find((a) => a.accountId === "A")!.days.at(-1)!
      .available,
    RUB(7500),
  );
  equal(
    projection.accounts.find((a) => a.accountId === "B")!.days.at(-1)!
      .available,
    RUB(10000),
  );
  const local = forecastFixture();
  local.accounts.find((a) => a.id === "A")!.openingBalance = RUB(1000);
  local.accounts.find((a) => a.id === "B")!.openingBalance = RUB(9000);
  local.settings.buffer = 0;
  local.settings.forecast!.dailySpending = 0;
  local.plannedIncomes = [];
  local.recurring[0].amount = RUB(2000);
  local.recurring[0].day = 20;
  const localProjection = immutable(local, () => forecast(local, 30, TODAY));
  equal(localProjection.days[0].available, RUB(8000));
  equal(
    localProjection.accounts.find((a) => a.accountId === "A")!.days[0]
      .available,
    -RUB(1000),
  );
  assert.ok(
    localProjection.accounts.find((a) => a.accountId === "A")!.firstShortfall,
  );
  assertions++;
  report["UC-07"] = {
    dailyBalancesRUB: expectedDays,
    lastAccountA: RUB(7500),
    lastAccountB: RUB(10000),
    dailyExpenseCount: 29,
    minimum: RUB(17500),
    accountShortfallExample: { total: RUB(8000), accountA: -RUB(1000) },
    inputUnchanged: true,
  };
}

{
  const plan = immutable(base, () =>
    planPurchase(projection, RUB(7500), TODAY, { state: base, accountId: "A" }),
  );
  equal(plan.maximum, RUB(7500));
  equal(plan.earliest, TODAY);
  const expensive = planPurchase(projection, 750001, TODAY, {
    state: base,
    accountId: "A",
  });
  equal(expensive.earliest, undefined);
  const purchased = immutable(base, () =>
    forecast(base, 30, TODAY, {
      amount: RUB(7500),
      date: TODAY,
      accountId: "A",
    }),
  );
  equal(
    purchased.accounts.find((a) => a.accountId === "A")!.days.at(-1)!.available,
    0,
  );
  equal(
    purchased.accounts.find((a) => a.accountId === "B")!.days.at(-1)!.available,
    RUB(10000),
  );
  equal(purchased.firstBelowBuffer, undefined);
  const excessProjection = forecast(base, 30, TODAY, {
    amount: 750001,
    date: TODAY,
    accountId: "A",
  });
  equal(
    excessProjection.accounts.find((a) => a.accountId === "A")!.days.at(-1)!
      .available,
    -1,
  );
  const allowance = immutable(base, () => spendable(base, TODAY));
  equal(allowance.available, RUB(14500));
  equal(allowance.daily, RUB(2900));
  equal(allowance.days, 5);
  const simulated = immutable(base, () =>
    simulatePurchase(base, RUB(7500), TODAY),
  );
  equal(simulated.after, RUB(7000));
  equal(simulated.dailyAfter, RUB(1400));
  const unassigned = structuredClone(base);
  delete unassigned.settings.forecast!.dailyAccountId;
  const unassignedPlan = planPurchase(
    forecast(unassigned, 30, TODAY),
    RUB(7500),
    TODAY,
    { state: unassigned, accountId: "A" },
  );
  equal(unassignedPlan.maximum, 0);
  const highReserve = structuredClone(base);
  highReserve.settings.buffer = RUB(20000);
  const reservePlan = planPurchase(
    forecast(highReserve, 30, TODAY),
    RUB(7500),
    TODAY,
    { state: highReserve, accountId: "A" },
  );
  equal(reservePlan.maximum, 0);
  report["UC-08"] = {
    maximum: plan.maximum,
    earliest: plan.earliest,
    tooExpensiveEarliest: expensive.earliest ?? null,
    accountAAfterMaximum: 0,
    accountAAfterExcess: -1,
    available: allowance.available,
    daily: allowance.daily,
    afterPurchase: simulated.after,
    dailyAfter: simulated.dailyAfter,
    unassignedMaximum: unassignedPlan.maximum,
    highReserveMaximum: reservePlan.maximum,
    inputUnchanged: true,
  };
}

{
  const scenario: SavedScenario = {
    id: "scenario",
    name: "Перенос дохода и уменьшение платежа",
    horizon: 30,
    changes: [
      {
        source: "income",
        sourceId: "income",
        name: "Доход",
        amount: RUB(10000),
        delayDays: 10,
        enabled: true,
      },
      {
        source: "payment",
        sourceId: "payment",
        name: "Платёж",
        amount: RUB(12000),
        delayDays: 0,
        enabled: true,
      },
    ],
    events: [
      {
        id: "extra",
        name: "Разовый расход",
        type: "expense",
        amount: RUB(4000),
        date: "2026-10-23",
        accountId: "A",
        enabled: true,
      },
      {
        id: "disabled",
        name: "Выключенный расход",
        type: "expense",
        amount: RUB(9000),
        date: "2026-10-23",
        accountId: "A",
        enabled: false,
      },
    ],
  };
  const projected = immutable(base, () =>
    forecast(base, 30, TODAY, undefined, scenario),
  );
  equal(projected.closingAvailable, RUB(19500));
  equal(projected.closingAvailable - projection.closingAvailable, RUB(2000));
  equal(projected.minimum.available, RUB(17000));
  equal(projected.minimum.date, "2026-11-03");
  equal(
    projected.days.find((d) => d.date === "2026-11-04")!.available,
    RUB(26500),
  );
  const incomeEvent = projected.days
    .find((d) => d.date === "2026-11-04")!
    .events.find((e) => e.type === "income")!;
  equal(incomeEvent.occurrenceDate, "2026-10-25");
  const { id: _id, ...input } = scenario;
  const saved = immutable(base, () => saveScenario(base, input));
  const copied = immutable(saved, () =>
    copyScenario(saved, saved.scenarios![0].id),
  );
  equal(copied.scenarios!.length, 2);
  equal(copied.accounts, base.accounts);
  equal(copied.transactions, base.transactions);
  equal(copied.recurring, base.recurring);
  equal(copied.plannedIncomes, base.plannedIncomes);
  assert.notEqual(copied.scenarios![0].id, copied.scenarios![1].id);
  assertions++;
  assert.notEqual(
    copied.scenarios![0].events[0].id,
    copied.scenarios![1].events[0].id,
  );
  assertions++;
  equal(copied.scenarios![1].events[1].enabled, false);
  const changed = saveTransaction(
    copied,
    {
      type: "expense",
      title: "Новый факт",
      amount: RUB(100),
      date: TODAY,
      accountId: "A",
      category: "groceries",
    },
    TODAY,
  );
  for (const item of changed.scenarios!)
    equal(
      forecast(changed, 30, TODAY, undefined, item).closingAvailable,
      RUB(19400),
    );
  report["UC-09"] = {
    closing: projected.closingAvailable,
    delta: RUB(2000),
    minimum: projected.minimum.available,
    minimumDate: projected.minimum.date,
    afterIncome: RUB(26500),
    incomeOriginalDate: incomeEvent.occurrenceDate,
    scenarioCountAfterCopy: 2,
    disabledEventPreserved: true,
    recalculatedBothAfterNewFact: RUB(19400),
    realPlansUnchanged: true,
    inputUnchanged: true,
  };
}

const output = {
  checkedOn: new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Samara",
  }).format(new Date()),
  mode: "domain-only; app not launched",
  execution:
    "Direct calls to current TypeScript domain functions on independent synthetic in-memory state; no UI, device, storage, server or user financial records.",
  monetaryUnit: "Integer minor units; RUB values explicitly marked otherwise.",
  command:
    "node --import tsx output/thesis/research/examples/prove-examples.mts",
  scenarios: report,
  assertions,
  passedScenarios: Object.keys(report).length,
};
writeFileSync(
  new URL("./results.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(JSON.stringify(output, null, 2));
