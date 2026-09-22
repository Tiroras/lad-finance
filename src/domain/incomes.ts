import { dateInMonth, monthKey, shiftMonth } from "../shared/lib/dates";
import type { FinanceState, PlannedIncome } from "./types";
import { scheduleDates } from "./recurrence";

export const incomeOccurrenceKey = (plan: PlannedIncome, date: string) =>
  plan.repeat === "once" ? "once" : plan.schedule ? date : monthKey(date);

export interface IncomeOccurrence {
  plan: PlannedIncome;
  date: string;
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
  for (const plan of state.plannedIncomes ?? []) {
    const add = (date: string) => {
      if (
        date >= start &&
        date < end &&
        date >= plan.date &&
        !incomeReceived(state, plan, date, asOf)
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
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
