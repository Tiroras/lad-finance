import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptDemo,
  completeOnboarding,
  type OnboardingInput,
} from "../src/domain/actions/onboarding";
import { accountBalance } from "../src/domain/accountBalances";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import { RATE_SCALE } from "../src/domain/currency";
import { canStartOnboarding } from "../src/domain/onboarding";
import { createInitialState } from "../src/domain/seed";
import type { FinanceState } from "../src/domain/types";

const TODAY = "2026-09-10";
const input: OnboardingInput = {
  name: "Тест",
  accountName: "Моя карта",
  currency: "RUB",
  balance: 1000000,
  savings: 200000,
  buffer: 100000,
  incomeName: "Зарплата",
  incomeAmount: 500000,
  incomeDate: "2026-09-15",
  billName: "Жильё",
  billAmount: 250000,
  billDate: "2026-09-18",
};

function newPersonalLedger() {
  const state = createInitialState(false, TODAY);
  state.settings.onboardingCompleted = false;
  return state;
}

test("initial ledgers are personal and contain no example money unless demo is explicit", () => {
  const state = createInitialState(undefined, TODAY);
  assert.equal(state.demo, false);
  assert.equal(state.settings.buffer, 0);
  assert.ok(state.accounts.every((account) => account.openingBalance === 0));
  assert.ok(state.categories.every((category) => category.budget === 0));
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.goals, []);
  assert.deepEqual(state.recurring, []);

  const demo = createInitialState(true, TODAY);
  assert.equal(demo.demo, true);
  assert.equal(accountBalance(demo, "card", TODAY), 7856000);
  assert.ok(demo.categories.every((category) => category.budget > 0));
  assert.ok(demo.transactions.length > 0);
  assert.ok(demo.goals.length > 0);
  assert.ok(demo.recurring.length > 0);
});

test("a fresh personal ledger can complete onboarding after a reload and background exchange update", () => {
  const initial = decodeBackup(encodeBackup(newPersonalLedger()));
  initial.settings.exchange = {
    automatic: true,
    fetchedOn: TODAY,
    rates: {
      USD: { value: 90 * RATE_SCALE, date: TODAY, source: "frankfurter" },
    },
  };
  const before = structuredClone(initial);
  assert.equal(canStartOnboarding(initial), true);
  const state = completeOnboarding(initial, input, TODAY);
  assert.deepEqual(initial, before);
  assert.equal(state.demo, false);
  assert.equal(state.settings.onboardingCompleted, true);
  assert.deepEqual(state.settings.exchange, initial.settings.exchange);
  assert.equal(accountBalance(state, "card", TODAY), 1000000);
  assert.equal(accountBalance(state, "savings", TODAY), 200000);
  assert.deepEqual(state.transactions, []);
  assert.equal(state.plannedIncomes?.[0].amount, 500000);
  assert.equal(state.recurring[0].amount, 250000);
  assert.ok(state.categories.every((category) => category.budget === 0));
  assert.equal(canStartOnboarding(state), false);
  assert.throws(() => completeOnboarding(state, input, TODAY), /уже начат/);
});

test("onboarding refuses current personal changes without losing records or settings", () => {
  const demo = createInitialState(true, TODAY);
  const changes: [string, (state: FinanceState) => void][] = [
    ["transaction", (state) => state.transactions.push(demo.transactions[0])],
    ["goal", (state) => state.goals.push(demo.goals[0])],
    ["payment", (state) => state.recurring.push(demo.recurring[0])],
    [
      "account balance",
      (state) => {
        state.accounts[0].openingBalance = 100;
      },
    ],
    [
      "account name",
      (state) => {
        state.accounts[0].name = "Своя карта";
      },
    ],
    [
      "account currency",
      (state) => {
        state.accounts[0].currency = "JPY";
      },
    ],
    [
      "deleted account",
      (state) => {
        state.accounts.pop();
      },
    ],
    [
      "category name",
      (state) => {
        state.categories[0].name = "Своя категория";
      },
    ],
    [
      "category budget",
      (state) => {
        state.categories[0].budget = 100;
      },
    ],
    [
      "archived category",
      (state) => {
        state.categories[0].archived = true;
      },
    ],
    [
      "profile",
      (state) => {
        state.settings.name = "Свое имя";
      },
    ],
    [
      "reserve",
      (state) => {
        state.settings.buffer = 100;
      },
    ],
    [
      "payday",
      (state) => {
        state.settings.payday = 10;
      },
    ],
    [
      "base currency",
      (state) => {
        state.settings.baseCurrency = "JPY";
      },
    ],
    [
      "forecast",
      (state) => {
        state.settings.forecast = { dailySpending: 100, goalDay: 10 };
      },
    ],
    [
      "reminders",
      (state) => {
        state.settings.reminders = { enabled: true, daysBefore: 1, hour: 10 };
      },
    ],
    [
      "planned income",
      (state) => {
        state.plannedIncomes = [
          {
            id: "income",
            name: "Доход",
            amount: 100,
            date: TODAY,
            repeat: "once",
            accountId: "card",
          },
        ];
      },
    ],
    [
      "scenario",
      (state) => {
        state.scenarios = [
          {
            id: "scenario",
            name: "Сценарий",
            horizon: 30,
            changes: [],
            events: [],
          },
        ];
      },
    ],
    [
      "category rule",
      (state) => {
        state.categoryRules = [
          {
            id: "rule",
            pattern: "магазин",
            match: "contains",
            category: "groceries",
            enabled: true,
          },
        ];
      },
    ],
    [
      "balance adjustment",
      (state) => {
        state.balanceAdjustments = [
          {
            id: "adjustment",
            accountId: "card",
            date: TODAY,
            amount: 100,
            note: "Сверка",
          },
        ];
      },
    ],
    [
      "reconciliation",
      (state) => {
        state.reconciliations = [
          {
            id: "reconciliation",
            accountId: "card",
            date: TODAY,
            balance: 0,
            signature: "0".repeat(64),
            note: "",
          },
        ];
      },
    ],
    [
      "debt",
      (state) => {
        state.debts = [
          {
            id: "debt",
            name: "Долг",
            direction: "borrowed",
            currency: "RUB",
            accountId: "card",
            openingAmount: 100,
            startsOn: TODAY,
          },
        ];
      },
    ],
  ];
  for (const [label, change] of changes) {
    const state = newPersonalLedger();
    assert.equal(canStartOnboarding(state), true, label);
    change(state);
    const before = structuredClone(state);
    assert.equal(canStartOnboarding(state), false, label);
    assert.throws(
      () => completeOnboarding(state, input, TODAY),
      /уже начат/,
      label,
    );
    assert.deepEqual(state, before, label);
  }
});

test("legacy and completed personal ledgers cannot opt into the initial wizard or accept demo", () => {
  for (const completed of [undefined, true]) {
    const state = createInitialState(false, TODAY);
    state.settings.onboardingCompleted = completed;
    const before = structuredClone(state);
    assert.equal(canStartOnboarding(state), false);
    assert.throws(() => completeOnboarding(state, input, TODAY), /уже начат/);
    assert.throws(() => acceptDemo(state), /Демонстрационный учёт не открыт/);
    assert.deepEqual(state, before);
  }
  const fresh = newPersonalLedger();
  assert.throws(() => acceptDemo(fresh), /Демонстрационный учёт не открыт/);
  assert.equal(fresh.settings.onboardingCompleted, false);
});

test("onboarding atomically replaces demo with actual balances and future plans, never booked income", () => {
  const demo = createInitialState(true, TODAY);
  const before = encodeBackup(demo);
  const state = completeOnboarding(demo, input, TODAY);
  assert.equal(encodeBackup(demo), before);
  assert.equal(state.demo, false);
  assert.equal(state.settings.onboardingCompleted, true);
  assert.equal(state.settings.name, "Тест");
  assert.equal(state.settings.buffer, 100000);
  assert.equal(state.settings.payday, 15);
  assert.equal(
    state.accounts.find((account) => account.id === "card")?.name,
    "Моя карта",
  );
  assert.equal(accountBalance(state, "card", TODAY), 1000000);
  assert.equal(accountBalance(state, "savings", TODAY), 200000);
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.goals, []);
  assert.equal(state.plannedIncomes?.[0].date, input.incomeDate);
  assert.equal(state.recurring[0].startsOn, input.billDate);
  assert.equal(state.recurring[0].amount, input.billAmount);
  assert.deepEqual(
    decodeBackup(encodeBackup(state)),
    JSON.parse(encodeBackup(state)),
  );
  assert.throws(() => completeOnboarding(state, input, TODAY), /уже начат/);
});

test("zero-valued optional plans can be skipped, demo choice preserves records, custom currency preserves minor units", () => {
  const demo = createInitialState(true, TODAY);
  const accepted = acceptDemo(demo);
  assert.equal(accepted.demo, true);
  assert.equal(accepted.settings.onboardingCompleted, true);
  assert.deepEqual(accepted.transactions, demo.transactions);
  assert.equal(demo.settings.onboardingCompleted, undefined);
  demo.settings.exchange = {
    automatic: false,
    rates: { JPY: { value: RATE_SCALE, source: "manual", date: TODAY } },
  };
  const state = completeOnboarding(
    demo,
    {
      ...input,
      currency: "JPY",
      balance: 12345,
      savings: 500,
      buffer: 10,
      incomeAmount: 0,
      billAmount: 0,
      incomeDate: "",
      billDate: "",
    },
    TODAY,
  );
  assert.equal(state.settings.baseCurrency, "JPY");
  assert.ok(state.accounts.every((account) => account.currency === "JPY"));
  assert.equal(accountBalance(state, "card", TODAY), 12345);
  assert.equal(state.recurring.length, 0);
  assert.equal(state.plannedIncomes?.length ?? 0, 0);
  assert.deepEqual(state.settings.exchange, demo.settings.exchange);
});

test("invalid onboarding fails without replacing any demo data", () => {
  const demo = createInitialState(true, TODAY);
  const before = encodeBackup(demo);
  for (const patch of [
    { balance: -1 },
    { savings: NaN },
    { accountName: " " },
    { incomeDate: "2026-09-09" },
    { billDate: "2026-02-30" },
    { name: "a".repeat(41) },
    { incomeName: "" },
    { currency: "USD" as const },
  ])
    assert.throws(() =>
      completeOnboarding(demo, { ...input, ...patch }, TODAY),
    );
  assert.equal(encodeBackup(demo), before);
});
