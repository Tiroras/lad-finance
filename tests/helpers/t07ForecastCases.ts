import { createInitialState } from "../../src/domain/seed";
import { forecast } from "../../src/domain/forecast";
import { planPurchase } from "../../src/domain/purchasePlanner";
import { saveForecastPreferences } from "../../src/domain/actions/settings";
import { decodeBackup, encodeBackup } from "../../src/domain/backup";
import type { FinanceState, ForecastTransfer } from "../../src/domain/types";
import { accountToBase } from "../../src/domain/currency";

export const TODAY = "2026-10-20";
const KEY = "lad-profile-personal:lad-finance-v1";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
}
function rejects(action: () => unknown, pattern: RegExp) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) return;
    throw error;
  }
  throw new Error(`Expected rejection ${pattern}`);
}
function base(): FinanceState {
  const state = createInitialState(false, TODAY);
  state.version = 8;
  state.accounts = [
    {
      id: "a",
      name: "Карта покупок",
      kind: "spending",
      openingBalance: 100_000,
      icon: "card-outline",
      color: "#000000",
    },
    {
      id: "b",
      name: "Основная карта",
      kind: "spending",
      openingBalance: 900_000,
      icon: "card-outline",
      color: "#000000",
    },
    {
      id: "s",
      name: "Накопления",
      kind: "savings",
      openingBalance: 0,
      icon: "wallet-outline",
      color: "#000000",
    },
  ];
  state.transactions = [];
  state.goals = [];
  state.recurring = [];
  state.plannedIncomes = [];
  state.settings.onboardingCompleted = true;
  state.settings.buffer = 0;
  state.settings.forecast = { dailySpending: 0, goalDay: 31 };
  state.settings.exchange = { automatic: false, rates: {} };
  return state;
}
function transfer(patch: Partial<ForecastTransfer> = {}): ForecastTransfer {
  return {
    id: "move",
    name: "Пополнение карты покупок",
    date: TODAY,
    accountId: "b",
    toAccountId: "a",
    amount: 100_000,
    ...patch,
  };
}
function selected(state: FinanceState, amount = 200_000, date = TODAY) {
  return planPurchase(forecast(state, 30, TODAY), amount, date, {
    state,
    accountId: "a",
  });
}
export const t07ForecastCases: { name: string; run: () => void }[] = [
  {
    name: "assigned annual fund keeps contribution, savings return and full expense distinct",
    run() {
      const state = base();
      state.accounts[2].openingBalance = 50_000;
      state.goals = [
        {
          id: "g",
          name: "Фонд",
          target: 100_000,
          initialSaved: 50_000,
          monthly: 20_000,
          icon: "wallet-outline",
          color: "#000000",
        },
      ];
      state.recurring = [
        {
          id: "annual",
          name: "Страховка",
          amount: 100_000,
          accountId: "a",
          day: 22,
          active: true,
          startsOn: TODAY,
          kind: "bill",
          category: "other",
          icon: "wallet-outline",
          color: "#000000",
        },
      ];
      state.goalFundCycles = [
        {
          id: "cycle",
          goalId: "g",
          recurringId: "annual",
          occurrenceDate: "2026-10-22",
          status: "active",
          createdOn: TODAY,
        },
      ];
      state.settings.forecast = {
        dailySpending: 0,
        goalDay: 20,
        goalAccounts: [{ goalId: "g", fromAccountId: "a", toAccountId: "s" }],
      };
      const result = forecast(state, 30, TODAY);
      equal(
        result.accounts.map((account) => account.days[2].balance),
        [50_000, 900_000, 0],
      );
      equal(result.fundReturns, 70_000);
      equal(result.income, 0);
      equal(result.closingAvailable, 950_000);
      equal(result.warnings, []);
    },
  },
  {
    name: "fund return cannot borrow cash from another unassigned savings account",
    run() {
      const state = base();
      state.accounts.push({
        ...state.accounts[2],
        id: "other-savings",
        openingBalance: 50_000,
      });
      state.goals = [
        {
          id: "g",
          name: "Фонд",
          target: 50_000,
          initialSaved: 50_000,
          monthly: 0,
          icon: "wallet-outline",
          color: "#000000",
        },
      ];
      state.recurring = [
        {
          id: "annual",
          name: "Страховка",
          amount: 50_000,
          accountId: "a",
          day: 22,
          active: true,
          startsOn: TODAY,
          kind: "bill",
          category: "other",
          icon: "wallet-outline",
          color: "#000000",
        },
      ];
      state.goalFundCycles = [
        {
          id: "cycle",
          goalId: "g",
          recurringId: "annual",
          occurrenceDate: "2026-10-22",
          status: "active",
          createdOn: TODAY,
        },
      ];
      state.settings.forecast!.goalAccounts = [
        { goalId: "g", fromAccountId: "a", toAccountId: "s" },
      ];
      equal(selected(state).maximum, 0);
      equal(
        forecast(state, 30, TODAY).warnings.some((warning) =>
          warning.includes("недостаточно"),
        ),
        true,
      );
    },
  },
  {
    name: "borrowed debt repayment uses assigned spending account",
    run() {
      const state = base();
      state.debts = [
        {
          id: "debt",
          name: "Заём",
          direction: "borrowed",
          currency: "RUB",
          accountId: "a",
          openingAmount: 20_000,
          startsOn: TODAY,
          dueDate: "2026-10-22",
        },
      ];
      state.settings.forecast!.repaymentAccounts = [
        { kind: "debt", sourceId: "debt", accountId: "b" },
      ];
      const result = forecast(state, 30, TODAY);
      equal(
        result.accounts.map((account) => account.days[2].balance),
        [100_000, 880_000, 0],
      );
      equal(result.closingAvailable, 980_000);
      equal(result.unallocatedEvents, []);
    },
  },
  {
    name: "JPY and KWD purchase uses revalued remainder instead of rounded debit",
    run() {
      for (const currency of ["JPY", "KWD"] as const) {
        const state = base();
        state.accounts[0].currency = currency;
        state.accounts[0].openingBalance = 2;
        state.accounts[1].openingBalance = 0;
        state.settings.exchange!.rates[currency] = {
          value: currency === "JPY" ? 400_000 : 400_000_000,
          date: TODAY,
          source: "manual",
        };
        state.settings.buffer = 1;
        equal(accountToBase(state, 1, "a"), 0);
        equal(forecast(state, 30, TODAY).closingAvailable, 1);
        equal(selected(state, 1).maximum, 0);
        equal(
          forecast(state, 30, TODAY, {
            accountId: "a",
            amount: 1,
            date: TODAY,
          }).closingAvailable,
          0,
        );
      }
    },
  },
  {
    name: "v8 aggregate equals native account valuation after repeated rounding",
    run() {
      const state = base();
      state.accounts[0].currency = "JPY";
      state.accounts[0].openingBalance = 100;
      state.accounts[1].openingBalance = 0;
      state.settings.exchange!.rates.JPY = {
        value: 400_000,
        date: TODAY,
        source: "manual",
      };
      state.settings.forecast = {
        dailySpending: 1,
        goalDay: 31,
        dailyAccountId: "a",
      };
      const result = forecast(state, 30, TODAY);
      for (const [index, day] of result.days.entries())
        equal(
          day.available,
          result.accounts
            .filter((entry) => entry.kind === "spending")
            .reduce(
              (sum, entry) =>
                sum +
                accountToBase(
                  state,
                  entry.days[index].available,
                  entry.accountId,
                ),
              0,
            ),
        );
      equal(result.accounts[0].days.at(-1)!.balance, 13);
      equal(result.closingAvailable, 5);
      equal(result.unallocatedEvents.length, 0);
    },
  },
  {
    name: "positive aggregate does not fund an empty selected account",
    run() {
      const state = base();
      equal(forecast(state, 30, TODAY).closingAvailable, 1_000_000);
      equal(selected(state).maximum, 100_000);
      equal(selected(state).earliest, undefined);
    },
  },
  {
    name: "explicit same-day transfer fixes selected account without creating facts",
    run() {
      const state = base();
      state.settings.forecast!.transfers = [transfer()];
      const before = JSON.stringify(state);
      const result = forecast(state, 30, TODAY);
      equal(selected(state).maximum, 200_000);
      equal(selected(state).earliest, TODAY);
      equal(result.closingAvailable, 1_000_000);
      equal([result.income, result.outflow], [0, 0]);
      equal(JSON.stringify(state), before);
    },
  },
  {
    name: "future transfer permits only its date and later",
    run() {
      const state = base();
      state.settings.forecast!.transfers = [transfer({ date: "2026-10-22" })];
      equal(selected(state).maximum, 100_000);
      equal(selected(state).earliest, "2026-10-22");
    },
  },
  {
    name: "last-day obligation limits purchase; next day stays outside",
    run() {
      const state = base();
      state.settings.forecast!.transfers = [transfer({ amount: 900_000 })];
      state.recurring = [
        {
          id: "rent",
          name: "Аренда",
          amount: 800_000,
          accountId: "a",
          startsOn: TODAY,
          day: 18,
          active: true,
          kind: "bill",
          category: "home",
          icon: "home-outline",
          color: "#000000",
        },
      ];
      equal(selected(state).maximum, 200_000);
      equal(selected(state, 200_001).earliest, undefined);
      state.recurring[0].day = 19;
      equal(selected(state).maximum, 1_000_000);
    },
  },
  {
    name: "global buffer applies even when selected account has enough cash",
    run() {
      const state = base();
      state.settings.buffer = 950_000;
      equal(selected(state).maximum, 50_000);
    },
  },
  {
    name: "base reserve shortfall never promises a safe date",
    run() {
      const state = base();
      state.settings.buffer = 1_000_001;
      equal(
        [selected(state).maximum, selected(state).earliest],
        [0, undefined],
      );
    },
  },
  {
    name: "daily spending without account preserves aggregate but blocks assurance",
    run() {
      const state = base();
      state.settings.forecast!.dailySpending = 100;
      const result = forecast(state, 30, TODAY);
      equal(result.closingAvailable, 997_100);
      equal(result.days.at(-1)!.unallocated, -2_900);
      equal(selected(state).unallocated, true);
      equal(selected(state).maximum, 0);
    },
  },
  {
    name: "assigned daily spending leaves no unallocated amount and starts tomorrow",
    run() {
      const state = base();
      state.settings.forecast = {
        dailySpending: 100,
        goalDay: 31,
        dailyAccountId: "a",
      };
      const result = forecast(state, 30, TODAY);
      equal(result.accounts[0].days[0].available, 100_000);
      equal(result.accounts[0].days[1].available, 99_900);
      equal(result.days.at(-1)!.unallocated, 0);
      equal(selected(state).maximum, 97_100);
    },
  },
  {
    name: "pending outgoing releases account hold when event posts in projection",
    run() {
      const state = base();
      state.transactions = [
        {
          id: "hold",
          title: "Ожидающая покупка",
          type: "expense",
          amount: 30_000,
          accountId: "a",
          date: TODAY,
          expectedDate: "2026-10-22",
          status: "pending",
          category: "other",
        },
      ];
      const result = forecast(state, 30, TODAY);
      equal(
        result.accounts[0].days
          .slice(0, 3)
          .map((day) => [day.balance, day.held, day.available]),
        [
          [100_000, 30_000, 70_000],
          [100_000, 30_000, 70_000],
          [70_000, 0, 70_000],
        ],
      );
      equal(result.closingAvailable, 970_000);
    },
  },
  {
    name: "undated pending never gains an incoming credit",
    run() {
      const state = base();
      state.transactions = [
        {
          id: "hold",
          title: "Ожидающий перевод",
          type: "transfer",
          amount: 30_000,
          accountId: "b",
          toAccountId: "a",
          date: TODAY,
          status: "pending",
          category: "other",
        },
      ];
      equal(selected(state).maximum, 100_000);
      equal(forecast(state, 30, TODAY).closingAvailable, 970_000);
    },
  },
  {
    name: "cross-currency pending carries both exact native amounts without income",
    run() {
      const state = base();
      state.accounts[0].currency = "JPY";
      state.accounts[0].openingBalance = 100;
      state.settings.exchange!.rates.JPY = {
        value: 60_000_000,
        date: TODAY,
        source: "manual",
      };
      state.transactions = [
        {
          id: "fx",
          title: "Обмен",
          type: "transfer",
          amount: 6_000,
          toAmount: 100,
          accountId: "b",
          toAccountId: "a",
          date: TODAY,
          expectedDate: "2026-10-22",
          status: "pending",
          category: "other",
        },
      ];
      const result = forecast(state, 30, TODAY);
      equal(result.accounts[0].days[2].balance, 200);
      equal(result.accounts[1].days[2].balance, 894_000);
      equal(result.income, 0);
      equal(result.days[2].held, 0);
    },
  },
  {
    name: "explicit KWD exchange uses two amounts and exact native purchase boundary",
    run() {
      const state = base();
      state.accounts[0].currency = "KWD";
      state.accounts[0].openingBalance = 1_000;
      state.settings.exchange!.rates.KWD = {
        value: 30_000_000_000,
        date: TODAY,
        source: "manual",
      };
      state.settings.forecast!.transfers = [
        transfer({ amount: 30_000, toAmount: 1_000 }),
      ];
      equal(selected(state, 2_000).maximum, 2_000);
      equal(selected(state, 2_001).earliest, undefined);
      equal(forecast(state, 30, TODAY).accounts[0].days[0].balance, 2_000);
    },
  },
  {
    name: "missing rate rejects rather than inventing an account valuation",
    run() {
      const state = base();
      state.accounts[0].currency = "USD";
      rejects(() => forecast(state, 30, TODAY), /курс USD/);
    },
  },
  {
    name: "goal contribution moves source into savings and reduces own available money",
    run() {
      const state = base();
      state.goals = [
        {
          id: "g",
          name: "Цель",
          target: 50_000,
          initialSaved: 0,
          monthly: 20_000,
          currency: "RUB",
          icon: "flag-outline" as never,
          color: "#000000",
        },
      ];
      state.settings.forecast = {
        dailySpending: 0,
        goalDay: 20,
        goalAccounts: [{ goalId: "g", fromAccountId: "a", toAccountId: "s" }],
      };
      const result = forecast(state, 30, TODAY);
      equal(
        result.accounts.map((account) => account.days[0].balance),
        [80_000, 900_000, 20_000],
      );
      equal(result.days[0].available, 980_000);
      equal(result.days[0].unallocated, 0);
    },
  },
  {
    name: "savings allocated to goals cannot fund a safe purchase via planned transfer",
    run() {
      const state = base();
      state.accounts[2].openingBalance = 100_000;
      state.goals = [
        {
          id: "g",
          name: "Цель",
          target: 100_000,
          initialSaved: 100_000,
          monthly: 0,
          icon: "wallet-outline",
          color: "#000000",
        },
      ];
      state.settings.forecast!.transfers = [transfer({ accountId: "s" })];
      equal(selected(state).maximum, 0);
      equal(
        forecast(state, 30, TODAY).warnings.some((warning) =>
          warning.includes("не обеспечивают цели"),
        ),
        true,
      );
    },
  },
  {
    name: "transfer with insufficient source never creates a purchase promise",
    run() {
      const state = base();
      state.settings.forecast!.transfers = [transfer({ amount: 900_001 })];
      equal(selected(state).maximum, 0);
      equal(
        forecast(state, 30, TODAY).warnings.some((warning) =>
          warning.includes("недостаточно"),
        ),
        true,
      );
    },
  },
  {
    name: "credit limit stays outside own money; assigned repayment transfers debt",
    run() {
      const state = base();
      state.accounts.push({
        id: "credit",
        name: "Кредит",
        kind: "credit",
        openingBalance: -50_000,
        creditLimit: 1_000_000,
        paymentDueAmount: 20_000,
        paymentDueDate: "2026-10-22",
        icon: "card-outline",
        color: "#000000",
      });
      state.settings.forecast!.repaymentAccounts = [
        { kind: "credit", sourceId: "credit", accountId: "a" },
      ];
      const result = forecast(state, 30, TODAY);
      equal(result.openingAvailable, 1_000_000);
      equal(
        result.accounts.find((account) => account.accountId === "credit")!
          .days[2].balance,
        -30_000,
      );
      equal(result.closingAvailable, 980_000);
    },
  },
  {
    name: "explicit credit repayment replaces covered obligation once",
    run() {
      const state = base();
      state.accounts.push({
        id: "credit",
        name: "Кредит",
        kind: "credit",
        openingBalance: -50_000,
        creditLimit: 1_000_000,
        paymentDueAmount: 20_000,
        paymentDueDate: "2026-10-22",
        icon: "card-outline",
        color: "#000000",
      });
      state.settings.forecast!.transfers = [
        transfer({ accountId: "a", toAccountId: "credit", amount: 20_000 }),
      ];
      const result = forecast(state, 30, TODAY);
      equal(result.closingAvailable, 980_000);
      equal(
        result.days
          .flatMap((day) => day.events)
          .filter((event) => event.type === "credit").length,
        0,
      );
      equal(result.accounts.at(-1)!.days[2].balance, -30_000);
    },
  },
  {
    name: "past transfer is visible as warning and never rolled forward",
    run() {
      const state = base();
      state.settings.forecast!.transfers = [transfer({ date: "2026-10-19" })];
      const result = forecast(state, 30, TODAY);
      equal(result.accounts[0].days[0].balance, 100_000);
      equal(result.warnings.length, 1);
      equal(selected(state).maximum, 0);
    },
  },
  {
    name: "leap day is included and beyond-2100 horizon rejects explicitly",
    run() {
      const state = base();
      equal(forecast(state, 30, "2028-02-01").days[28].date, "2028-02-29");
      equal(forecast(state, 30, "2100-12-02").days.at(-1)!.date, "2100-12-31");
      rejects(() => forecast(state, 30, "2100-12-03"), /2100/);
      rejects(() => forecast(state, 90, "2100-11-01"), /2100/);
    },
  },
  {
    name: "legacy preferences retain aggregate without injecting assignments",
    run() {
      const state = base();
      state.version = 4;
      state.settings.forecast!.dailySpending = 100;
      const previous = JSON.stringify(state);
      equal(forecast(state, 30, TODAY).closingAvailable, 997_100);
      equal(JSON.stringify(state), previous);
    },
  },
  {
    name: "saving account forecast upgrades format and survives JSON",
    run() {
      const state = base();
      state.version = 7;
      const next = saveForecastPreferences(state, {
        dailySpending: 0,
        goalDay: 31,
        transfers: [transfer()],
      });
      equal(next.version, 8);
      const restored = decodeBackup(encodeBackup(next), TODAY);
      equal(selected(restored).maximum, 200_000);
      equal(next.transactions, state.transactions);
    },
  },
];

export function installForecastFixture() {
  if (sessionStorage.getItem("t07-forecast-installed")) return;
  localStorage.setItem(KEY, encodeBackup(base()));
  localStorage.setItem("lad-active-profile-v1", "personal");
  localStorage.setItem(
    "lad-profiles-v1",
    JSON.stringify({
      version: 1,
      profiles: [{ id: "personal", name: "Личный" }],
    }),
  );
  sessionStorage.setItem("t07-forecast-installed", "true");
}
export function readForecastFixture() {
  return decodeBackup(localStorage.getItem(KEY)!, TODAY);
}
