import type { Transaction } from "../../src/domain/types";
import { createInitialState } from "../../src/domain/seed";
import { shiftDate } from "../../src/shared/lib/dates";

export const FIXTURE_SEED = 20261006;
export const FIXTURE_TODAY = "2026-10-06";
export const FIXTURE_SIZES = [1000, 5000, 20000] as const;

/** Synthetic only. No current clock, random IDs, device storage or demo profile. */
export function createPerformanceFixture(count: number, seed = FIXTURE_SEED) {
  if (count < 10 || count > 20000 || count % 10 !== 0)
    throw new Error("Размер должен быть кратен 10, от 10 до 20000.");
  const state = createInitialState(false, FIXTURE_TODAY);
  state.settings = {
    name: "A10 синтетический",
    payday: 25,
    buffer: 100000,
    onboardingCompleted: true,
    baseCurrency: "RUB",
    exchange: {
      automatic: false,
      rates: {
        USD: { value: 9000000000, date: FIXTURE_TODAY, source: "manual" },
        JPY: { value: 60000000, date: FIXTURE_TODAY, source: "manual" },
        KWD: { value: 30000000000, date: FIXTURE_TODAY, source: "manual" },
      },
    },
    forecast: { dailySpending: 1234, goalDay: 31 },
  };
  state.accounts = [
    {
      id: "r",
      name: "RUB тест",
      currency: "RUB",
      openingBalance: 1000000000,
      kind: "spending",
      icon: "card-outline",
      color: "#254D3E",
    },
    {
      id: "u",
      name: "USD тест",
      currency: "USD",
      openingBalance: 10000000,
      kind: "spending",
      icon: "card-outline",
      color: "#254D3E",
    },
    {
      id: "j",
      name: "JPY тест",
      currency: "JPY",
      openingBalance: 10000000,
      kind: "spending",
      icon: "cash-outline",
      color: "#254D3E",
    },
    {
      id: "k",
      name: "KWD тест",
      currency: "KWD",
      openingBalance: 10000000,
      kind: "spending",
      icon: "cash-outline",
      color: "#254D3E",
    },
    {
      id: "s",
      name: "Резерв тест",
      currency: "RUB",
      openingBalance: 10000000,
      kind: "savings",
      icon: "wallet-outline",
      color: "#254D3E",
    },
  ];
  state.goals = [
    {
      id: "g",
      name: "Тестовая цель",
      target: 10000000,
      initialSaved: 1000000,
      monthly: 100000,
      currency: "RUB",
      icon: "leaf-outline",
      color: "#254D3E",
    },
  ];
  state.debts = [
    {
      id: "d",
      name: "Синтетический долг",
      direction: "borrowed",
      currency: "RUB",
      accountId: "r",
      openingAmount: 10000,
      startsOn: "2025-01-01",
      dueDate: "2026-10-20",
    },
  ];
  const units = ["day", "week", "month", "year"] as const;
  state.recurring = Array.from({ length: 40 }, (_, i) => {
    const unit = units[i % 4];
    const anchor =
      unit === "month"
        ? "2026-08-31"
        : unit === "year"
          ? "2025-12-31"
          : "2026-10-01";
    return {
      id: `p${i}`,
      name: `Платёж ${i}`,
      amount: 100 + i * 7,
      day: Number(anchor.slice(-2)),
      kind: "bill",
      active: true,
      icon: "home-outline",
      color: "#254D3E",
      category: "home",
      accountId: "r",
      startsOn: "2026-10-01",
      schedule: { unit, interval: 1 + (i % 3), anchor },
      ...(unit === "day"
        ? {
            skippedDates: [anchor],
            amountHistory: [{ until: "2026-10-05", amount: 51 + i }],
          }
        : {}),
    };
  });
  state.plannedIncomes = Array.from({ length: 20 }, (_, i) => {
    const unit = units[i % 4];
    const anchor =
      unit === "month"
        ? "2026-08-31"
        : unit === "year"
          ? "2025-12-31"
          : "2026-10-01";
    return {
      id: `i${i}`,
      name: `Доход ${i}`,
      amount: 500 + i * 13,
      date: anchor,
      repeat: "monthly",
      accountId: "r",
      schedule: { unit, interval: 1 + (i % 3), anchor },
    };
  });
  let random = seed >>> 0;
  let sumUnits = 0;
  for (let block = 0; block < count / 10; block++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const u = 10 * (10 + (random % 90));
    sumUnits += u;
    const date = shiftDate("2025-10-07", block % 364);
    const firstId = `t${block * 10}`;
    const entries: Partial<Transaction>[] = [
      {
        type: "expense",
        amount: 4 * u,
        baseAmount: 4 * u,
        splits: [
          { category: "groceries", amount: u },
          { category: "home", amount: 3 * u },
        ],
      },
      { type: "income", amount: 2 * u, baseAmount: 2 * u, refundOf: firstId },
      { type: "income", amount: 10 * u, baseAmount: 10 * u },
      {
        type: "transfer",
        amount: 90 * u,
        baseAmount: 90 * u,
        toAccountId: "u",
        toAmount: u,
      },
      { type: "expense", accountId: "j", amount: u, baseAmount: 60 * u },
      { type: "income", accountId: "k", amount: u, baseAmount: 30 * u },
      {
        type: "income",
        amount: 5 * u,
        baseAmount: 5 * u,
        debtId: "d",
        debtAction: "issue",
      },
      {
        type: "expense",
        amount: 2 * u,
        baseAmount: 2 * u,
        debtId: "d",
        debtAction: "repay",
      },
      { type: "expense", amount: 3 * u, baseAmount: 3 * u },
      { type: "expense", accountId: "u", amount: u, baseAmount: 90 * u },
    ];
    entries.forEach((entry, index) =>
      state.transactions.push({
        id: `t${block * 10 + index}`,
        title: index === 8 ? "Поиск чай" : "Тест",
        date,
        category: "groceries",
        accountId: "r",
        ...entry,
      } as Transaction),
    );
  }
  // Independent algebraic checks from the ten-entry recipe, never application totals.
  const expected = {
    income: 40 * sumUnits,
    expense: 155 * sumUnits,
    count: (count * 9) / 10,
    searchCount: count / 10,
    searchExpense: 3 * sumUnits,
    category: { groceries: 153.5 * sumUnits, home: 1.5 * sumUnits },
    balances: {
      r: 1000000000 - 82 * sumUnits,
      u: 10000000,
      j: 10000000 - sumUnits,
      k: 10000000 + sumUnits,
      s: 10000000,
    },
    debt: 10000 + 3 * sumUnits,
  };
  return { state, expected, seed, count, sumUnits };
}

export type PerformanceFixture = ReturnType<typeof createPerformanceFixture>;

/** Valid legacy UTF-16 snapshot >5 MB UTF-8; old reader permits it, new exports do not. */
export function createLegacyPerformanceFixture() {
  const state = createPerformanceFixture(10000).state;
  state.transactions.forEach((transaction) => {
    transaction.note = "Я".repeat(200);
  });
  return state;
}

/** Exact UTF-8 boundary including multibyte notes, without invalid overlong fields. */
export function createBoundaryPerformanceFixture(targetBytes = 5000000) {
  const state = createPerformanceFixture(20000).state;
  let remaining = targetBytes - Buffer.byteLength(JSON.stringify(state));
  for (const transaction of state.transactions) {
    if (remaining <= 10) break;
    const payload = Math.min(1000, remaining - 10); // ,"note":"" = 10 ASCII bytes
    transaction.note =
      "Я".repeat(Math.floor(payload / 2)) + "x".repeat(payload % 2);
    remaining -= payload + 10;
  }
  if (remaining !== 0) throw new Error(`Нельзя получить границу: ${remaining}`);
  return state;
}
