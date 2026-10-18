import { validateScenarioCurrencies } from "./scenarios";
import { accountToBase, MAX_MONEY, receivedAmount, toBase } from "./currency";
import { accountBalances } from "./accountBalances";
import { goalContributions } from "./goals";
import { overduePayments, paymentPending, upcoming } from "./payments";
import {
  dateInMonth,
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import { incomeOccurrences } from "./incomes";
import { projectedDebtObligations } from "./debts";
import type { FinanceState, ForecastPreferences, SavedScenario } from "./types";
import {
  pendingProjection,
  spendingHeld,
  transactionStatus,
} from "./transactionStatus";

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
  versionId?: string;
  overdue?: boolean;
  pendingId?: string;
  releaseHeld?: number;
}
export interface ForecastDay {
  date: string;
  openingBalance: number;
  balance: number;
  projectedBalance: number;
  held: number;
  available: number;
  events: ForecastEvent[];
}
export interface ForecastResult {
  days: ForecastDay[];
  openingBalance: number;
  closingBalance: number;
  openingHeld: number;
  openingAvailable: number;
  closingAvailable: number;
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
  for (const {
    plan,
    date,
    occurrenceDate,
    versionId,
    pending,
  } of incomeOccurrences(
    state,
    scenario ? shiftDate(today, -90) : today,
    scenario ? shiftDate(end, 90) : end,
    today,
  )) {
    if (pending) continue;
    const override = change("income", plan.id);
    const amount = override?.amount ?? plan.amount;
    if (amount === 0) continue;
    add(shiftDate(date, override?.delayDays ?? 0), {
      id: `income:${plan.id}:${versionId}:${occurrenceDate}`,
      type: "income",
      name: plan.name,
      amount: accountToBase(state, amount, plan.accountId),
      sourceId: plan.id,
      occurrenceDate,
      versionId,
    });
  }
  for (const { payment, date, versionId, paid, skipped } of [
    ...overduePayments(state, today),
    ...upcoming(state, today, end),
  ]) {
    if (paid || skipped || paymentPending(state, payment, date, versionId))
      continue;
    const overdue = date < today;
    // A future price change must not rewrite existing arrears.
    const amount = overdue
      ? payment.amount
      : (change("payment", payment.id)?.amount ?? payment.amount);
    if (amount === 0) continue;
    add(overdue ? today : date, {
      id: `payment:${payment.id}:${versionId ?? "legacy"}:${date}`,
      type: "payment",
      name: payment.name,
      amount: -accountToBase(state, amount, payment.accountId),
      sourceId: payment.id,
      occurrenceDate: date,
      versionId,
      overdue,
    });
  }

  // Linked intentions replace the original plan event, including an undated
  // or late income that must not reappear as a reliable planned receipt.
  const spending = new Set(
    state.accounts
      .filter((account) => account.kind === "spending")
      .map((account) => account.id),
  );
  for (const transaction of state.transactions) {
    if (transactionStatus(transaction) !== "pending") continue;
    const date = pendingProjection(transaction, today);
    if (!date) continue;
    const outgoing =
      transaction.type !== "income" && spending.has(transaction.accountId)
        ? accountToBase(state, transaction.amount, transaction.accountId)
        : 0;
    const incoming =
      transaction.type === "income" && spending.has(transaction.accountId)
        ? accountToBase(state, transaction.amount, transaction.accountId)
        : transaction.type === "transfer" &&
            transaction.toAccountId &&
            spending.has(transaction.toAccountId)
          ? accountToBase(
              state,
              receivedAmount(transaction),
              transaction.toAccountId,
            )
          : 0;
    // An overdue incoming transfer is not reliable spending money. Keep the
    // source reservation and both legs together until a new date or a fact.
    if (
      transaction.type === "transfer" &&
      transaction.expectedDate! < today &&
      outgoing === 0 &&
      incoming > 0
    )
      continue;
    add(date, {
      id: `pending:${transaction.id}`,
      pendingId: transaction.id,
      type:
        transaction.type === "income" || incoming > outgoing
          ? "income"
          : "expense",
      name: transaction.title,
      amount: incoming - outgoing,
      releaseHeld: outgoing,
      sourceId: transaction.id,
      occurrenceDate:
        transaction.occurrenceDate ??
        transaction.incomeOccurrenceDate ??
        transaction.expectedDate!,
      overdue: transaction.expectedDate! < today,
    });
  }

  for (const obligation of projectedDebtObligations(
    state,
    today,
    shiftDate(end, -1),
  )) {
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
  const openingHeld = spendingHeld(state);
  let balance = openingBalance,
    held = openingHeld,
    income = 0,
    outflow = 0;
  for (let date = today; date < end; date = shiftDate(date, 1)) {
    const events = byDate.get(date) ?? [];
    const opening = balance;
    for (const event of events) {
      balance += event.amount;
      held -= event.releaseHeld ?? 0;
      if (event.amount > 0) income += event.amount;
      else outflow -= event.amount;
    }
    days.push({
      date,
      openingBalance: opening,
      balance,
      projectedBalance: balance,
      held,
      available: balance - held,
      events,
    });
  }
  return {
    days,
    openingBalance,
    closingBalance: balance,
    openingHeld,
    openingAvailable: openingBalance - openingHeld,
    closingAvailable: balance - held,
    minimum: days.reduce((min, day) =>
      day.available < min.available ? day : min,
    ),
    firstShortfall: days.find((day) => day.available < 0),
    firstBelowBuffer: days.find((day) => day.available < state.settings.buffer),
    buffer: state.settings.buffer,
    income,
    outflow,
  };
}
