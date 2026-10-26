import assert from "node:assert/strict";
import { test } from "node:test";
import { accountBalance } from "../src/domain/accountBalances";
import {
  copyScenario,
  deleteGoal,
  deleteTransaction,
  fundGoal,
  saveTransaction,
  saveForecastPreferences,
  saveScenario,
  withdrawGoal,
} from "../src/domain/actions";
import {
  changeBaseCurrency,
  saveCurrencyRate,
} from "../src/domain/actions/currencies";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { goalContributions, goalSaved } from "../src/domain/goals";
import { createInitialState } from "../src/domain/seed";
import type { FinanceState } from "../src/domain/types";

const TODAY = "2026-10-26";
function fixture(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.accounts.find((account) => account.id === "card")!.openingBalance =
    100_000;
  state.accounts.find((account) => account.id === "savings")!.openingBalance =
    100_000;
  state.goals = [
    {
      id: "trip",
      name: "Поездка",
      currency: "RUB",
      target: 100_000,
      initialSaved: 60_000,
      monthly: 20_000,
      icon: "airplane-outline",
      color: "#FFFFFF",
    },
    {
      id: "other-goal",
      name: "Подушка",
      target: 40_000,
      initialSaved: 40_000,
      monthly: 0,
      icon: "shield-checkmark-outline",
      color: "#FFFFFF",
    },
  ];
  return state;
}
const input = {
  goalId: "trip",
  amount: 25_000,
  accountId: "savings",
  toAccountId: "card",
};

test("withdrawal atomically returns money, keeps other goals and history, and supports the full saved amount", () => {
  const state = fixture();
  const before = structuredClone(state);
  const next = withdrawGoal(state, input, TODAY);
  assert.equal(next.version, 9);
  assert.equal(goalSaved(next, next.goals[0], TODAY), 35_000);
  assert.equal(goalSaved(next, next.goals[0], "2026-10-25"), 60_000);
  assert.equal(goalSaved(next, next.goals[1], TODAY), 40_000);
  assert.equal(accountBalance(next, "savings", TODAY), 75_000);
  assert.equal(accountBalance(next, "card", TODAY), 125_000);
  assert.equal(next.transactions.length, 1);
  assert.equal(next.transactions[0].type, "transfer");
  assert.equal(next.transactions[0].goalId, undefined);
  assert.deepEqual(next.goals, state.goals);
  assert.deepEqual(state, before);
  const full = withdrawGoal(next, { ...input, amount: 35_000 }, TODAY);
  assert.equal(goalSaved(full, full.goals[0], TODAY), 0);
  assert.equal(accountBalance(full, "savings", TODAY), 40_000);
  assert.deepEqual(
    goalContributions(full, TODAY),
    goalContributions(state, TODAY),
  );
});

test("withdrawal rejects invalid sums, unavailable accounts and stale requests without a partial transfer", () => {
  const state = fixture();
  const before = structuredClone(state);
  for (const patch of [
    { amount: 0 },
    { amount: -1 },
    { amount: 1.1 },
    { amount: NaN },
    { amount: 60_001 },
    { goalId: "missing" },
    { accountId: "card" },
    { toAccountId: "savings" },
    { accountId: "missing" },
    { toAccountId: "missing" },
  ])
    assert.throws(() => withdrawGoal(state, { ...input, ...patch }, TODAY));
  for (const id of ["savings", "card"]) {
    const archived = structuredClone(state);
    archived.accounts.find((account) => account.id === id)!.archived = true;
    assert.throws(() => withdrawGoal(archived, input, TODAY), /активный/);
  }
  const empty = withdrawGoal(state, { ...input, amount: 60_000 }, TODAY);
  assert.throws(
    () => withdrawGoal(empty, input, TODAY),
    /больше, чем накоплено/,
  );
  assert.deepEqual(state, before);
});

test("withdrawal checks the chosen account and pending holds even when other savings have money", () => {
  let state = fixture();
  state.accounts.push({
    ...state.accounts[2],
    id: "small",
    openingBalance: 1_000,
  });
  assert.throws(
    () => withdrawGoal(state, { ...input, accountId: "small" }, TODAY),
    /недостаточно/,
  );
  state.accounts[2].openingBalance += 10_000;
  state = saveTransaction(
    state,
    {
      type: "transfer",
      title: "Ожидаемый перевод",
      amount: 10_000,
      date: TODAY,
      category: "other",
      accountId: "savings",
      toAccountId: "card",
      status: "pending",
    },
    TODAY,
  );
  const next = withdrawGoal(state, { ...input, amount: 60_000 }, TODAY);
  assert.equal(accountBalance(next, "savings", TODAY), 50_000);
  assert.equal(goalSaved(next, next.goals[1], TODAY), 40_000);
});

test("withdrawal keeps fulfilled contributions fulfilled and allows later funding toward the target", () => {
  let state = fixture();
  state = fundGoal(
    state,
    { goalId: "trip", accountId: "card", amount: 20_000 },
    TODAY,
  );
  const contributions = goalContributions(state, TODAY);
  state = withdrawGoal(state, input, TODAY);
  assert.deepEqual(goalContributions(state, TODAY), contributions);
  state = fundGoal(
    state,
    { goalId: "trip", accountId: "card", amount: 45_000 },
    TODAY,
  );
  assert.equal(goalSaved(state, state.goals[0], TODAY), 100_000);
  const release = state.goalReleases![0];
  assert.throws(
    () => deleteTransaction(state, release.transferId, TODAY),
    /больше её суммы/,
  );
  assert.throws(
    () =>
      saveTransaction(
        state,
        {
          ...state.transactions.find(
            (entry) => entry.id === release.transferId,
          )!,
          amount: 1_000,
        },
        TODAY,
      ),
    /больше её суммы/,
  );
});

test("withdrawal edits and deletion update the release and balances together", () => {
  const state = fixture();
  const next = withdrawGoal(state, input, TODAY);
  const edited = saveTransaction(
    next,
    { ...next.transactions[0], amount: 30_000 },
    TODAY,
  );
  assert.equal(edited.goalReleases![0].amount, 30_000);
  assert.equal(goalSaved(edited, edited.goals[0], TODAY), 30_000);
  assert.equal(accountBalance(edited, "card", TODAY), 130_000);
  assert.throws(
    () =>
      saveTransaction(
        edited,
        { ...edited.transactions[0], amount: 60_001 },
        TODAY,
      ),
    /превышает/,
  );
  assert.throws(() =>
    saveTransaction(
      edited,
      { ...edited.transactions[0], type: "income" },
      TODAY,
    ),
  );
  const removed = deleteTransaction(edited, edited.transactions[0].id, TODAY);
  assert.equal(removed.goalReleases!.length, 0);
  assert.equal(goalSaved(removed, removed.goals[0], TODAY), 60_000);
  assert.equal(accountBalance(removed, "savings", TODAY), 100_000);
  assert.equal(accountBalance(removed, "card", TODAY), 100_000);
});

test("past funding cannot move after a withdrawal or disappear once it backs that withdrawal", () => {
  const state = fixture();
  state.goals[0].initialSaved = 0;
  let next = fundGoal(
    state,
    { goalId: "trip", accountId: "card", amount: 40_000 },
    "2026-10-24",
  );
  const contribution = next.transactions[0];
  next = withdrawGoal(next, input, "2026-10-25");
  assert.throws(
    () => saveTransaction(next, { ...contribution, date: TODAY }, TODAY),
    /превышает/,
  );
  assert.throws(
    () => deleteTransaction(next, contribution.id, TODAY),
    /превышает/,
  );
});

test("goal deletion keeps the withdrawal transfer and removes only goal links", () => {
  const next = withdrawGoal(fixture(), input, TODAY);
  const removed = deleteGoal(next, "trip");
  assert.deepEqual(removed.transactions, next.transactions);
  assert.equal(removed.goalReleases!.length, 0);
  assert.doesNotThrow(() => decodeBackup(encodeBackup(removed), TODAY));
});

test("withdrawal JSON round trips and rejects broken links, underfunding and old format labels", () => {
  const state = withdrawGoal(fixture(), input, TODAY);
  const restored = decodeBackup(encodeBackup(state), TODAY);
  assert.deepEqual(restored.goalReleases, state.goalReleases);
  assert.equal(goalSaved(restored, restored.goals[0], TODAY), 35_000);
  for (const version of [7, 8] as const) {
    assert.throws(() => encodeBackup({ ...state, version }), /версии 9/);
    assert.throws(() =>
      decodeBackup(JSON.stringify({ ...state, version }), TODAY),
    );
  }
  for (const patch of [
    { amount: 1 },
    { date: "2026-10-25" },
    { transferId: "missing" },
    { goalId: "missing" },
    { cycleId: "missing" },
  ]) {
    const bad = {
      ...state,
      goalReleases: [{ ...state.goalReleases![0], ...patch }],
    };
    assert.throws(() => decodeBackup(JSON.stringify(bad), TODAY));
  }
  const duplicate = {
    ...state,
    goalReleases: [
      state.goalReleases![0],
      { ...state.goalReleases![0], id: "second" },
    ],
  };
  assert.throws(
    () => decodeBackup(JSON.stringify(duplicate), TODAY),
    /Один перевод/,
  );
  const old = fixture();
  old.version = 8;
  assert.equal(decodeBackup(encodeBackup(old), TODAY).version, 8);
  assert.equal(decodeBackup(encodeBackup(old), TODAY).goalReleases, undefined);
});

test("standalone withdrawals respect the shared 500-release limit used by annual funds", () => {
  const state = withdrawGoal(fixture(), { ...input, amount: 1 }, TODAY);
  state.goalReleases = Array.from({ length: 500 }, (_, index) => ({
    ...state.goalReleases![0],
    id: `release-${index}`,
    transferId: `transfer-${index}`,
  }));
  state.transactions = state.goalReleases.map((release) => ({
    ...state.transactions[0],
    id: release.transferId,
  }));
  assert.doesNotThrow(() => decodeBackup(encodeBackup(state), TODAY));
  assert.throws(
    () => withdrawGoal(state, { ...input, amount: 1 }, TODAY),
    /500 возвратов/,
  );
  const next = deleteTransaction(state, state.transactions[0].id, TODAY);
  assert.equal(
    withdrawGoal(next, { ...input, amount: 1 }, TODAY).goalReleases!.length,
    500,
  );
});

test("scenarios saved, edited and copied after a withdrawal retain format 9 and the financial history", () => {
  const state = withdrawGoal(fixture(), input, TODAY);
  const before = structuredClone(state);
  const created = saveScenario(state, {
    name: "Покупка после вывода",
    horizon: 30,
    changes: [],
    events: [
      {
        id: "purchase",
        name: "Покупка",
        type: "expense",
        amount: 10_000,
        date: TODAY,
        accountId: "card",
      },
    ],
  });
  const edited = saveScenario(created, {
    ...created.scenarios![0],
    changes: [
      {
        source: "goal",
        sourceId: "trip",
        name: "Поездка",
        amount: 15_000,
        delayDays: 0,
        enabled: false,
      },
    ],
    events: [],
  });
  const copied = copyScenario(edited, edited.scenarios![0].id);
  for (const next of [created, edited, copied]) {
    assert.equal(next.version, 9);
    const restored = decodeBackup(encodeBackup(next), TODAY);
    assert.deepEqual(restored.scenarios, next.scenarios);
    assert.deepEqual(restored.goalReleases, state.goalReleases);
    assert.deepEqual(next.transactions, state.transactions);
    assert.deepEqual(next.accounts, state.accounts);
    assert.deepEqual(next.goals, state.goals);
    assert.equal(goalSaved(restored, restored.goals[0], TODAY), 35_000);
  }
  assert.equal(created.scenarios!.length, 1);
  assert.equal(edited.scenarios!.length, 1);
  assert.equal(copied.scenarios!.length, 2);
  assert.notEqual(copied.scenarios![0].id, copied.scenarios![1].id);
  assert.deepEqual(state, before);
});

test("scenario row flags promote old data to format 8 only when present", () => {
  const state = fixture();
  const scenario = {
    name: "Старый вариант",
    horizon: 30 as const,
    changes: [],
    events: [
      {
        id: "purchase",
        name: "Покупка",
        type: "expense" as const,
        amount: 10_000,
        date: TODAY,
      },
    ],
  };
  assert.equal(saveScenario(state, scenario).version, state.version);
  for (const patch of [
    { enabled: true },
    { enabled: false },
    { accountId: "card" },
  ]) {
    const next = saveScenario(state, {
      ...scenario,
      events: [{ ...scenario.events[0], ...patch }],
    });
    assert.equal(next.version, 8);
    assert.equal(decodeBackup(encodeBackup(next), TODAY).version, 8);
  }
});

test("JPY to KWD withdrawal stores both exact amounts and subsequent actions retain format 9", () => {
  let state = fixture();
  state = saveCurrencyRate(state, "JPY", 600000, TODAY);
  state = saveCurrencyRate(state, "KWD", 300000000, TODAY);
  state.goals = [
    { ...state.goals[0], currency: "JPY", initialSaved: 1000, target: 2000 },
  ];
  state.accounts[2] = {
    ...state.accounts[2],
    currency: "JPY",
    openingBalance: 1000,
  };
  state.accounts[0] = {
    ...state.accounts[0],
    currency: "KWD",
    openingBalance: 0,
  };
  state = withdrawGoal(state, { ...input, amount: 201, toAmount: 403 }, TODAY);
  assert.equal(goalSaved(state, state.goals[0], TODAY), 799);
  assert.equal(accountBalance(state, "savings", TODAY), 799);
  assert.equal(accountBalance(state, "card", TODAY), 403);
  assert.doesNotThrow(() => decodeBackup(encodeBackup(state), TODAY));
  state = saveTransaction(
    state,
    {
      type: "income",
      title: "Доход",
      amount: 1000,
      date: TODAY,
      category: "other",
      accountId: "card",
    },
    TODAY,
  );
  assert.equal(state.version, 9);
  state = saveForecastPreferences(state, {
    dailySpending: 0,
    goalDay: 31,
    dailyAccountId: "card",
  });
  assert.equal(state.version, 9);
  state = changeBaseCurrency(state, "JPY", TODAY);
  assert.equal(state.version, 9);
  assert.doesNotThrow(() => decodeBackup(encodeBackup(state), TODAY));
  assert.throws(
    () =>
      withdrawGoal(
        state,
        { ...input, accountId: "cash", amount: 1, toAmount: 1 },
        TODAY,
      ),
    /в валюте цели/,
  );
});
