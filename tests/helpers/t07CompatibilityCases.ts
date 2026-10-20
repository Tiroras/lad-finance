import assert from "./browserDomainAssert";
import corpus from "../fixtures/t07LegacyNormalization.json";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import { fingerprintFinanceState } from "../../src/domain/backupRecovery";
import { forecast } from "../../src/domain/forecast";
import { createInitialState } from "../../src/domain/seed";
import { saveForecastPreferences } from "../../src/domain/actions/settings";
import { archiveAccount } from "../../src/domain/actions/accountArchive";
import { deleteGoal } from "../../src/domain/actions/goals";
import { deleteDebt } from "../../src/domain/actions/debts";
import { confirmCreditTerms } from "../../src/domain/actions/accounts";
import { changeBaseCurrency } from "../../src/domain/actions/currencies";
import type { FinanceState, ForecastPreferences } from "../../src/domain/types";
import { annualFundFixture } from "./t06FundCases";
import {
  createAnnualFund,
  payFundedPayment,
} from "../../src/domain/actions/goalFunds";
import { spendable } from "../../src/domain/finance";
import { dataCapacity, nearCapacity } from "../../src/domain/dataLimits";
import { categoryBudget, validateBudgetPlans } from "../../src/domain/budgets";
import { MAX_MONEY } from "../../src/domain/currency";

const TODAY = corpus.normalizationDate;
const base = (): FinanceState => {
  const state = createInitialState(false, TODAY);
  state.accounts[0].openingBalance = 1_000_000;
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
};
const preferences = (): ForecastPreferences => ({
  dailySpending: 1000,
  goalDay: 31,
  dailyAccountId: "card",
  transfers: [
    {
      id: "tr",
      name: "На карту",
      date: "2026-10-21",
      accountId: "cash",
      toAccountId: "card",
      amount: 10000,
    },
  ],
});
type Case = { name: string; run(): void };
export const t07CompatibilityCases: Case[] = [
  {
    name: "Unassigned daily expenses do not hide a planned withdrawal of goal backing",
    run() {
      const state = base();
      state.accounts.find(
        (account) => account.id === "savings",
      )!.openingBalance = 100000;
      state.goals = [
        {
          id: "g",
          name: "Цель",
          target: 100000,
          initialSaved: 100000,
          monthly: 0,
          icon: "leaf-outline",
          color: "#254D3E",
        },
      ];
      const next = saveForecastPreferences(state, {
        dailySpending: 100,
        goalDay: 31,
        transfers: [
          {
            id: "withdraw",
            name: "Вывод",
            date: "2026-10-21",
            accountId: "savings",
            toAccountId: "card",
            amount: 100000,
          },
        ],
      });
      next.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 10000,
          date: "2026-10-21",
          repeat: "once",
          accountId: "card",
        },
      ];
      assert.ok(
        forecast(next, 30, TODAY).warnings.some((message) =>
          message.includes("не обеспечивают цели"),
        ),
      );
      assert.equal(spendable(next, TODAY).available, 0);
    },
  },
  {
    name: "Unassigned legacy goals do not create fictitious savings-backing warnings",
    run() {
      const state = base();
      state.version = 7;
      state.goals = [
        {
          id: "g",
          name: "Цель",
          target: 500000,
          initialSaved: 0,
          monthly: 100000,
          icon: "leaf-outline",
          color: "#254D3E",
        },
      ];
      state.settings.forecast = { dailySpending: 0, goalDay: 21 };
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 10000,
          date: "2026-10-21",
          repeat: "once",
          accountId: "card",
        },
      ];
      assert.deepEqual(forecast(state, 30, TODAY).warnings, []);
      assert.equal(spendable(state, TODAY).available, 900000);
    },
  },
  {
    name: "A century of weekly maximum budget carry remains exact and over-limit terms reject",
    run() {
      const state = base();
      const start = "2000-01-03",
        end = "2100-12-31";
      state.budgetPlans = [
        {
          categoryId: "other",
          period: "weekly",
          startDay: 1,
          anchor: start,
          rolloverSurplus: true,
          rolloverDeficit: true,
          changes: [{ from: "2000-01-01", amount: MAX_MONEY }],
          overrides: [],
        },
      ];
      const days =
        (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
        86400000;
      const periods = BigInt(Math.floor(days / 7) + 1);
      const result = categoryBudget(state, "other", end, end);
      assert.equal(BigInt(result.budget), periods * BigInt(MAX_MONEY));
      assert.ok(Number.isSafeInteger(result.budget));
      assert.doesNotThrow(() => validateBudgetPlans(state));
      state.budgetPlans[0].changes[0].amount = MAX_MONEY + 1;
      assert.throws(() => decodeBackup(JSON.stringify(state), TODAY));
    },
  },
  {
    name: "Spendable cannot rely on an unfunded planned savings return",
    run() {
      const state = saveForecastPreferences(base(), {
        dailySpending: 0,
        goalDay: 31,
        transfers: [
          {
            id: "fake",
            name: "Возврат",
            date: "2026-10-21",
            accountId: "savings",
            toAccountId: "card",
            amount: 1000000,
          },
        ],
      });
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 10000,
          date: "2026-10-21",
          repeat: "once",
          accountId: "card",
        },
      ];
      state.recurring = [
        {
          id: "bill",
          name: "Платёж",
          amount: 1500000,
          day: 22,
          kind: "bill",
          active: true,
          icon: "home-outline",
          color: "#254D3E",
          category: "other",
          accountId: "card",
          startsOn: TODAY,
        },
      ];
      assert.ok(forecast(state, 30, TODAY).warnings.length > 0);
      assert.equal(spendable(state, TODAY).available, 0);
    },
  },
  {
    name: "Spendable protection uses native daily rounding after income exactly once",
    run() {
      const state = base();
      state.version = 8;
      state.accounts[0].currency = "JPY";
      state.accounts[0].openingBalance = 10000;
      state.settings.exchange!.rates.JPY = {
        value: 60_000_000,
        source: "manual",
        date: TODAY,
      };
      state.settings.forecast = {
        dailySpending: 10000,
        goalDay: 31,
        dailyAccountId: "card",
      };
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          date: "2026-10-21",
          repeat: "once",
          accountId: "card",
        },
      ];
      assert.equal(spendable(state, TODAY).available, 369420);
      assert.equal(forecast(state, 30, TODAY).closingAvailable, 369420);
    },
  },
  {
    name: "New foreign annual-fund payment records the known valuation basis",
    run() {
      const state = annualFundFixture();
      state.accounts = state.accounts.map((account) => ({
        ...account,
        currency: "USD",
      }));
      state.goals[0].currency = "USD";
      state.settings.exchange!.rates.USD = {
        value: 9_000_000_000,
        source: "manual",
        date: TODAY,
      };
      const linked = createAnnualFund(
        state,
        {
          recurringId: "annual",
          occurrenceDate: "2026-12-10",
          goalId: "annual-goal",
          monthly: 0,
        },
        TODAY,
      );
      const paid = payFundedPayment(
        linked,
        { cycleId: linked.goalFundCycles![0].id, savingsAccountId: "savings" },
        TODAY,
      );
      const payment = paid.transactions.find(
        (transaction) => transaction.type === "expense",
      )!;
      assert.deepEqual(payment.valuation, { source: "current", date: TODAY });
      assert.equal(paid.version, 8);
      assert.equal(
        paid.transactions.find((transaction) => transaction.type === "transfer")
          ?.valuation,
        undefined,
      );
      assert.doesNotThrow(() => decodeBackup(encodeBackup(paid), TODAY));
    },
  },
  {
    name: "Spendable future protection retains explicit spending-to-savings plans",
    run() {
      const state = saveForecastPreferences(base(), {
        dailySpending: 0,
        goalDay: 31,
        transfers: [
          {
            id: "save",
            name: "В накопления",
            date: "2026-10-21",
            accountId: "card",
            toAccountId: "savings",
            amount: 999999,
          },
        ],
      });
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          date: "2026-10-25",
          repeat: "once",
          accountId: "card",
        },
      ];
      assert.equal(spendable(state, TODAY).available, 1);
    },
  },
  {
    name: "The last supported year cannot crash spendable or promise unchecked future protection",
    run() {
      const state = base();
      state.plannedIncomes = [
        {
          id: "salary",
          name: "Доход",
          amount: 1000,
          date: "2100-12-25",
          repeat: "once",
          accountId: "card",
        },
      ];
      const result = spendable(state, "2100-12-20");
      assert.equal(result.available, 0);
      assert.equal(result.protection, undefined);
    },
  },
  {
    name: "Annual fund capacity warns at 400 of the actionable limit 500",
    run() {
      const state = base();
      state.goalFundCycles = Array.from({ length: 400 }, (_, index) => ({
        id: String(index),
        goalId: "unused",
        occurrenceDate: TODAY,
        status: "cancelled" as const,
        createdOn: TODAY,
      }));
      const entry = dataCapacity(state).find(
        (item) => item.key === "goalFundCycles",
      )!;
      assert.equal(entry.limit, 500);
      assert.ok(nearCapacity(entry.used, entry.limit));
    },
  },
  ...corpus.cases.map((entry): Case => ({
    name: `Committed T06 format ${entry.version} normalization, fingerprint and aggregate are unchanged`,
    run() {
      const state = decodeBackup(entry.raw, TODAY);
      assert.equal(encodeBackup(state), entry.encoded);
      assert.deepEqual(fingerprintFinanceState(state), entry.fingerprint);
      assert.deepEqual(
        forecast(state, 30, TODAY).days.map(({ date, balance, available }) => ({
          date,
          balance,
          available,
        })),
        entry.balances,
      );
    },
  })),
  {
    name: "Assignments upgrade to v8, roundtrip, and never post money",
    run() {
      const state = base();
      const raw = JSON.stringify(state);
      const next = saveForecastPreferences(state, preferences());
      assert.equal(next.version, 8);
      assert.equal(JSON.stringify(state), raw);
      assert.deepEqual(next.accounts, state.accounts);
      assert.deepEqual(next.transactions, state.transactions);
      assert.deepEqual(
        decodeBackup(encodeBackup(next), TODAY).settings.forecast,
        next.settings.forecast,
      );
    },
  },
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((version) =>
    [
      "valuation",
      "assignment",
      "change-enabled",
      "event-enabled",
      "event-account",
    ].map((field) => ({
      name: `Format ${version} rejects ${field} before unknown-field stripping`,
      run() {
        const state: any = base();
        state.version = version;
        if (field === "valuation")
          state.transactions = [
            {
              id: "x",
              title: "Расход",
              type: "expense",
              amount: 1,
              baseAmount: 1,
              date: TODAY,
              accountId: "card",
              category: "other",
              valuation: { date: TODAY, source: "manual" },
            },
          ];
        if (field === "assignment") state.settings.forecast = preferences();
        if (field.startsWith("change") || field.startsWith("event"))
          state.scenarios = [
            {
              id: "s",
              name: "Вариант",
              horizon: 30,
              changes:
                field === "change-enabled"
                  ? [
                      {
                        source: "goal",
                        sourceId: "gone",
                        name: "Старая цель",
                        amount: 1,
                        delayDays: 0,
                        enabled: false,
                      },
                    ]
                  : [],
              events: field.startsWith("event")
                ? [
                    {
                      id: "e",
                      name: "Разовый",
                      type: "expense",
                      date: TODAY,
                      amount: 1,
                      ...(field === "event-enabled"
                        ? { enabled: false }
                        : { accountId: "card" }),
                    },
                  ]
                : [],
            },
          ];
        assert.throws(
          () => decodeBackup(JSON.stringify(state), TODAY),
          /Не удалось прочитать файл/,
        );
      },
    })),
  ),
  ...[
    { dailyAccountId: "savings" },
    { dailyAccountId: "missing" },
    { transfers: [{ ...preferences().transfers![0], toAccountId: "cash" }] },
    { transfers: [{ ...preferences().transfers![0], toAmount: 9999 }] },
    { transfers: [{ ...preferences().transfers![0], date: "2101-01-01" }] },
    {
      transfers: [
        { ...preferences().transfers![0], amount: Number.MAX_SAFE_INTEGER },
      ],
    },
    { transfers: [preferences().transfers![0], preferences().transfers![0]] },
    {
      goalAccounts: [
        { goalId: "missing", fromAccountId: "card", toAccountId: "savings" },
      ],
    },
    {
      repaymentAccounts: [
        { kind: "debt" as const, sourceId: "missing", accountId: "card" },
      ],
    },
  ].map((patch, index): Case => ({
    name: `Invalid forecast assignment ${index + 1} rejects both action and JSON`,
    run() {
      const state = base();
      const input = { ...preferences(), ...patch };
      const raw = JSON.stringify(state);
      assert.throws(() => saveForecastPreferences(state, input));
      assert.equal(JSON.stringify(state), raw);
      assert.throws(() =>
        decodeBackup(
          JSON.stringify({
            ...state,
            version: 8,
            settings: { ...state.settings, forecast: input },
          }),
          TODAY,
        ),
      );
    },
  })),
  {
    name: "Archive must not leave a dangling forecast account",
    run() {
      const state = base();
      state.accounts[0].openingBalance = 0;
      const next = saveForecastPreferences(state, preferences());
      assert.throws(() => archiveAccount(next, "card", TODAY), /прогноз/);
      const cleared = saveForecastPreferences(next, {
        dailySpending: 0,
        goalDay: 31,
      });
      assert.equal(archiveAccount(cleared, "card", TODAY).version, 8);
    },
  },
  {
    name: "Deleting goal/debt clears only their forecast assignments",
    run() {
      const state = base();
      state.goals = [
        {
          id: "g",
          name: "Цель",
          target: 1000,
          initialSaved: 0,
          monthly: 100,
          icon: "leaf-outline",
          color: "#254D3E",
        },
      ];
      state.debts = [
        {
          id: "d",
          name: "Долг",
          direction: "borrowed",
          accountId: "card",
          currency: "RUB",
          openingAmount: 0,
          startsOn: TODAY,
        },
      ];
      const next = saveForecastPreferences(state, {
        ...preferences(),
        goalAccounts: [
          { goalId: "g", fromAccountId: "card", toAccountId: "savings" },
        ],
        repaymentAccounts: [{ kind: "debt", sourceId: "d", accountId: "card" }],
      });
      const cleared = deleteDebt(deleteGoal(next, "g"), "d");
      assert.deepEqual(cleared.settings.forecast?.goalAccounts, []);
      assert.deepEqual(cleared.settings.forecast?.repaymentAccounts, []);
      assert.deepEqual(
        cleared.settings.forecast?.transfers,
        next.settings.forecast?.transfers,
      );
      assert.doesNotThrow(() => decodeBackup(encodeBackup(cleared), TODAY));
    },
  },
  {
    name: "T06 credit confirmation preserves format8 assignments",
    run() {
      const state = saveForecastPreferences(base(), preferences());
      state.accounts.push({
        id: "credit",
        name: "Кредит",
        kind: "credit",
        openingBalance: -10000,
        creditLimit: 100000,
        icon: "card-outline",
        color: "#254D3E",
      });
      const next = confirmCreditTerms(
        state,
        {
          accountId: "credit",
          paymentDueDate: "2026-10-25",
          paymentDueAmount: 1000,
        },
        TODAY,
      );
      assert.equal(next.version, 8);
      assert.deepEqual(
        decodeBackup(encodeBackup(next), TODAY).settings.forecast,
        state.settings.forecast,
      );
    },
  },
  {
    name: "Base-currency change preserves native planned transfer amounts and provenance is valid",
    run() {
      const state = saveForecastPreferences(base(), preferences());
      state.settings.exchange!.rates.USD = {
        value: 9_000_000_000,
        date: TODAY,
        source: "manual",
      };
      state.transactions = [
        {
          id: "t",
          title: "Перевод",
          type: "transfer",
          amount: 1000,
          date: TODAY,
          category: "other",
          accountId: "card",
          toAccountId: "cash",
        },
      ];
      const next = changeBaseCurrency(state, "USD", TODAY);
      assert.equal(next.version, 8);
      assert.deepEqual(
        next.settings.forecast?.transfers,
        state.settings.forecast?.transfers,
      );
      assert.equal(next.transactions[0].valuation, undefined);
      assert.doesNotThrow(() => decodeBackup(encodeBackup(next), TODAY));
    },
  },
];
