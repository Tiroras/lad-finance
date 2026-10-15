import { dateInMonth, monthKey, shiftMonth } from "../shared/lib/dates";
import type { FinanceState, PlannedIncome, Transaction } from "./types";
import { scheduleDates } from "./recurrence";
import {
  isPosted,
  pendingProjection,
  transactionStatus,
} from "./transactionStatus";

export const incomeOccurrenceKey = (plan: PlannedIncome, date: string) =>
  plan.repeat === "once" ? "once" : plan.schedule ? date : monthKey(date);

export function canLinkIncome(
  transaction: Transaction,
  plan: PlannedIncome,
  today: string,
) {
  return (
    transaction.type === "income" &&
    isPosted(transaction) &&
    !transaction.plannedIncomeId &&
    !transaction.refundOf &&
    !transaction.debtId &&
    transaction.accountId === plan.accountId &&
    transaction.amount === plan.amount &&
    transaction.date <= today
  );
}

export interface IncomeOccurrence {
  plan: PlannedIncome;
  date: string;
  occurrenceDate?: string;
  pending?: Transaction;
}

export function incomeReceived(
  state: FinanceState,
  plan: PlannedIncome,
  date: string,
  today: string,
) {
  return state.transactions.find(
    (t) =>
      t.type === "income" &&
      isPosted(t) &&
      t.date <= today &&
      t.plannedIncomeId === plan.id &&
      t.incomeOccurrenceDate &&
      incomeOccurrenceKey(plan, t.incomeOccurrenceDate) ===
        incomeOccurrenceKey(plan, date),
  );
}

export function incomeOccurrences(
  state: FinanceState,
  start: string,
  end: string,
  asOf = start,
): IncomeOccurrence[] {
  const result: IncomeOccurrence[] = [];
  const plans = new Map(
    (state.plannedIncomes ?? []).map((plan) => [plan.id, plan]),
  );
  const received = new Set<string>();
  const pending = new Map<string, Transaction>();
  for (const transaction of state.transactions) {
    const plan = transaction.plannedIncomeId
      ? plans.get(transaction.plannedIncomeId)
      : undefined;
    if (
      plan &&
      transactionStatus(transaction) === "pending" &&
      transaction.incomeOccurrenceDate
    )
      pending.set(
        `${plan.id}:${incomeOccurrenceKey(plan, transaction.incomeOccurrenceDate)}`,
        transaction,
      );
    if (
      plan &&
      transaction.type === "income" &&
      isPosted(transaction) &&
      transaction.date <= asOf &&
      transaction.incomeOccurrenceDate
    )
      received.add(
        `${plan.id}:${incomeOccurrenceKey(plan, transaction.incomeOccurrenceDate)}`,
      );
  }
  for (const plan of plans.values()) {
    const add = (date: string) => {
      if (
        date >= start &&
        date < end &&
        date >= plan.date &&
        !received.has(`${plan.id}:${incomeOccurrenceKey(plan, date)}`) &&
        !pending.has(`${plan.id}:${incomeOccurrenceKey(plan, date)}`)
      )
        result.push({ plan, date });
    };
    if (plan.repeat === "once") add(plan.date);
    else if (plan.schedule)
      for (const date of scheduleDates(plan.schedule, start, end)) add(date);
    else
      for (
        let month = `${monthKey(start)}-01`;
        month < end;
        month = shiftMonth(month, 1)
      )
        add(dateInMonth(month, Number(plan.date.slice(-2))));
  }
  for (const transaction of pending.values()) {
    const plan = plans.get(transaction.plannedIncomeId!)!;
    const date = pendingProjection(transaction, asOf);
    if (date && date >= start && date < end)
      result.push({
        plan,
        date,
        occurrenceDate: transaction.incomeOccurrenceDate,
        pending: transaction,
      });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function incomePending(
  state: FinanceState,
  plan: PlannedIncome,
  date: string,
) {
  return state.transactions.find(
    (transaction) =>
      transactionStatus(transaction) === "pending" &&
      transaction.plannedIncomeId === plan.id &&
      transaction.incomeOccurrenceDate &&
      incomeOccurrenceKey(plan, transaction.incomeOccurrenceDate) ===
        incomeOccurrenceKey(plan, date),
  );
}
