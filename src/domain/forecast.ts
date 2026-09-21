import {
  accountBalance,
  dateInMonth,
  goalSaved,
  localDate,
  MAX_MONEY,
  monthKey,
  overduePayments,
  shiftDate,
  shiftMonth,
  upcoming,
  validDate,
} from "./finance";
import { incomeOccurrences } from "./incomes";
import type { FinanceState, ForecastPreferences } from "./types";

export type ForecastHorizon = 30 | 60 | 90;
export const DEFAULT_FORECAST: ForecastPreferences = {
  dailySpending: 0,
  goalDay: 31,
};
export interface PurchaseScenario {
  amount: number;
  date: string;
}
export interface ForecastEvent {
  id: string;
  type: "income" | "payment" | "goal" | "daily" | "purchase";
  name: string;
  // Signed change in the balance of spending accounts, in kopecks.
  amount: number;
  sourceId?: string;
  occurrenceDate: string;
  overdue?: boolean;
}
export interface ForecastDay {
  date: string;
  openingBalance: number;
  balance: number;
  events: ForecastEvent[];
}
export interface ForecastResult {
  days: ForecastDay[];
  openingBalance: number;
  closingBalance: number;
  minimum: ForecastDay;
  firstShortfall?: ForecastDay;
  firstBelowBuffer?: ForecastDay;
  buffer: number;
  income: number;
  outflow: number;
}

/** End-of-day projection; it never posts transactions or changes goal balances. */
export function forecast(
  state: FinanceState,
  horizon: ForecastHorizon,
  today = localDate(),
  purchase?: PurchaseScenario,
): ForecastResult {
  if (![30, 60, 90].includes(horizon) || !validDate(today))
    throw new Error(
      "Укажите период прогноза 30, 60 или 90 дней и корректную дату.",
    );
  const end = shiftDate(today, horizon);
  if (
    purchase &&
    (!Number.isSafeInteger(purchase.amount) ||
      purchase.amount <= 0 ||
      purchase.amount > MAX_MONEY ||
      !validDate(purchase.date) ||
      purchase.date < today ||
      purchase.date >= end)
  )
    throw new Error(
      "Укажите положительную стоимость и дату покупки внутри прогноза.",
    );

  const preferences = state.settings.forecast ?? DEFAULT_FORECAST;
  const byDate = new Map<string, ForecastEvent[]>();
  const add = (date: string, event: ForecastEvent) => {
    if (date >= today && date < end)
      byDate.set(date, [...(byDate.get(date) ?? []), event]);
  };
  for (const { plan, date } of incomeOccurrences(state, today, end))
    add(date, {
      id: `income:${plan.id}:${date}`,
      type: "income",
      name: plan.name,
      amount: plan.amount,
      sourceId: plan.id,
      occurrenceDate: date,
    });
  for (const { payment, date, paid, skipped } of [
    ...overduePayments(state, today),
    ...upcoming(state, today, end),
  ]) {
    if (paid || skipped) continue;
    const overdue = date < today;
    add(overdue ? today : date, {
      id: `payment:${payment.id}:${date}`,
      type: "payment",
      name: payment.name,
      amount: -payment.amount,
      sourceId: payment.id,
      occurrenceDate: date,
      overdue,
    });
  }

  for (const goal of state.goals) {
    let remaining = Math.max(0, goal.target - goalSaved(state, goal, today));
    const contributed = state.transactions
      .filter(
        (t) =>
          t.type === "transfer" &&
          t.goalId === goal.id &&
          monthKey(t.date) === monthKey(today) &&
          t.date <= today,
      )
      .reduce((sum, t) => sum + t.amount, 0);
    for (
      let month = `${monthKey(today)}-01`;
      month < end && remaining > 0;
      month = shiftMonth(month, 1)
    ) {
      const date = dateInMonth(month, preferences.goalDay);
      const amount = Math.max(
        0,
        Math.min(
          remaining,
          goal.monthly -
            (monthKey(month) === monthKey(today) ? contributed : 0),
        ),
      );
      if (date >= end || amount === 0) continue;
      remaining -= amount;
      add(date < today ? today : date, {
        id: `goal:${goal.id}:${date}`,
        type: "goal",
        name: goal.name,
        amount: -amount,
        sourceId: goal.id,
        occurrenceDate: date,
        overdue: date < today,
      });
    }
  }
  // Today's actual expenses are already included in the opening balance.
  for (let date = shiftDate(today, 1); date < end; date = shiftDate(date, 1))
    if (preferences.dailySpending > 0)
      add(date, {
        id: `daily:${date}`,
        type: "daily",
        name: "Повседневные расходы",
        amount: -preferences.dailySpending,
        occurrenceDate: date,
      });
  if (purchase)
    add(purchase.date, {
      id: "purchase",
      type: "purchase",
      name: "Покупка в сценарии",
      amount: -purchase.amount,
      occurrenceDate: purchase.date,
    });

  const openingBalance = state.accounts
    .filter((a) => a.kind === "spending")
    .reduce((sum, a) => sum + accountBalance(state, a.id, today), 0);
  const days: ForecastDay[] = [];
  let balance = openingBalance,
    income = 0,
    outflow = 0;
  for (let date = today; date < end; date = shiftDate(date, 1)) {
    const events = byDate.get(date) ?? [];
    const opening = balance;
    for (const event of events) {
      balance += event.amount;
      if (event.amount > 0) income += event.amount;
      else outflow -= event.amount;
    }
    days.push({ date, openingBalance: opening, balance, events });
  }
  return {
    days,
    openingBalance,
    closingBalance: balance,
    minimum: days.reduce((min, day) => (day.balance < min.balance ? day : min)),
    firstShortfall: days.find((day) => day.balance < 0),
    firstBelowBuffer: days.find((day) => day.balance < state.settings.buffer),
    buffer: state.settings.buffer,
    income,
    outflow,
  };
}
