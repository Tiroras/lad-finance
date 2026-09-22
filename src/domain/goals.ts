import { localDate, monthKey } from "../shared/lib/dates";
import { receivedAmount, toBase } from "./currency";
import type { FinanceState, Goal } from "./types";

export function goalContributions(state: FinanceState, today = localDate()) {
  const contributions = new Map<string, { total: number; month: number }>();
  const month = monthKey(today);
  for (const transaction of state.transactions) {
    if (
      transaction.type !== "transfer" ||
      !transaction.goalId ||
      transaction.date > today
    )
      continue;
    const saved = contributions.get(transaction.goalId) ?? {
      total: 0,
      month: 0,
    };
    const amount = receivedAmount(transaction);
    saved.total += amount;
    if (monthKey(transaction.date) === month) saved.month += amount;
    contributions.set(transaction.goalId, saved);
  }
  return contributions;
}

export const goalSaved = (
  state: FinanceState,
  goal: Goal,
  today = localDate(),
) =>
  goal.initialSaved +
  (goalContributions(state, today).get(goal.id)?.total ?? 0);

export function goalReserve(state: FinanceState, today = localDate()) {
  const contributions = goalContributions(state, today);
  return state.goals.reduce((sum, goal) => {
    const contributed = contributions.get(goal.id);
    return (
      sum +
      toBase(
        state,
        Math.max(
          0,
          Math.min(
            goal.target - goal.initialSaved - (contributed?.total ?? 0),
            goal.monthly - (contributed?.month ?? 0),
          ),
        ),
        goal.currency,
      )
    );
  }, 0);
}
