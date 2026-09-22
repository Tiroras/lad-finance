import { validateScenarioCurrencies } from "./scenarios";
import { accountToBase, MAX_MONEY, toBase } from "./currency";
import { accountBalances } from "./accountBalances";
import { goalContributions } from "./goals";
import { overduePayments, upcoming } from "./payments";
import {
  dateInMonth,
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import { incomeOccurrences } from "./incomes";
import { debtObligations } from "./debts";
import type { FinanceState, ForecastPreferences, SavedScenario } from "./types";

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
  type:
    | "income"
    | "payment"
    | "goal"
    | "daily"
    | "purchase"
    | "expense"
    | "debt"
    | "credit";
  name: string;
  // Signed change in the balance of spending accounts, in base-currency minor units.
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
  scenario?: SavedScenario,
): ForecastResult {
  if (![30, 60, 90].includes(horizon) || !validDate(today))
    throw new Error(
      "Укажите период прогноза 30, 60 или 90 дней и корректную дату.",
    );
  if (scenario) validateScenarioCurrencies(state, scenario);
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
  const change = (source: "income" | "payment" | "goal", id: string) =>
    scenario?.changes.find((c) => c.source === source && c.sourceId === id);
  const dailySpending = scenario?.dailySpending ?? preferences.dailySpending;
  const byDate = new Map<string, ForecastEvent[]>();
  const add = (date: string, event: ForecastEvent) => {
    if (date >= today && date < end) {
      const events = byDate.get(date);
      if (events) events.push(event);
      else byDate.set(date, [event]);
    }
  };
  // Keep original occurrence identity when shifting dates, including early receipts.
  for (const { plan, date } of incomeOccurrences(
    state,
    scenario ? shiftDate(today, -90) : today,
    scenario ? shiftDate(end, 90) : end,
    today,
  )) {
    const override = change("income", plan.id);
    const amount = override?.amount ?? plan.amount;
    if (amount === 0) continue;
    add(shiftDate(date, override?.delayDays ?? 0), {
      id: `income:${plan.id}:${date}`,
      type: "income",
      name: plan.name,
      amount: accountToBase(state, amount, plan.accountId),
      sourceId: plan.id,
      occurrenceDate: date,
    });
  }
  for (const { payment, date, paid, skipped } of [
    ...overduePayments(state, today),
    ...upcoming(state, today, end),
  ]) {
    if (paid || skipped) continue;
    const overdue = date < today;
    // A future price change must not rewrite existing arrears.
    const amount = overdue
      ? payment.amount
      : (change("payment", payment.id)?.amount ?? payment.amount);
    if (amount === 0) continue;
    add(overdue ? today : date, {
      id: `payment:${payment.id}:${date}`,
      type: "payment",
      name: payment.name,
      amount: -accountToBase(state, amount, payment.accountId),
      sourceId: payment.id,
      occurrenceDate: date,
      overdue,
    });
  }

  for (const obligation of debtObligations(state, today, shiftDate(end, -1))) {
    add(obligation.date < today ? today : obligation.date, {
      id: `${obligation.kind}:${obligation.id}`,
      type: obligation.kind,
      name: obligation.name,
      amount: -accountToBase(state, obligation.amount, obligation.accountId),
      sourceId: obligation.id,
      occurrenceDate: obligation.date,
      overdue: obligation.date < today,
    });
  }

  const contributions = goalContributions(state, today);
  for (const goal of state.goals) {
    const contributed = contributions.get(goal.id);
    let remaining = Math.max(
      0,
      goal.target - goal.initialSaved - (contributed?.total ?? 0),
    );
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
          (change("goal", goal.id)?.amount ?? goal.monthly) -
            (monthKey(month) === monthKey(today)
              ? (contributed?.month ?? 0)
              : 0),
        ),
      );
      if (date >= end || amount === 0) continue;
      remaining -= amount;
      add(date < today ? today : date, {
        id: `goal:${goal.id}:${date}`,
        type: "goal",
        name: goal.name,
        amount: -toBase(state, amount, goal.currency),
        sourceId: goal.id,
        occurrenceDate: date,
        overdue: date < today,
      });
    }
  }
  // Today's actual expenses are already included in the opening balance.
  for (let date = shiftDate(today, 1); date < end; date = shiftDate(date, 1))
    if (dailySpending > 0)
      add(date, {
        id: `daily:${date}`,
        type: "daily",
        name: "Повседневные расходы",
        amount: -dailySpending,
        occurrenceDate: date,
      });
  for (const event of scenario?.events ?? [])
    add(event.date, {
      id: `scenario:${event.id}`,
      type: event.type,
      name: event.name,
      amount: event.type === "income" ? event.amount : -event.amount,
      occurrenceDate: event.date,
    });
  if (purchase)
    add(purchase.date, {
      id: "purchase",
      type: "purchase",
      name: "Покупка в сценарии",
      amount: -purchase.amount,
      occurrenceDate: purchase.date,
    });

  const balances = accountBalances(state, today);
  const openingBalance = state.accounts
    .filter((a) => a.kind === "spending")
    .reduce(
      (sum, a) => sum + accountToBase(state, balances.get(a.id) ?? 0, a.id),
      0,
    );
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
