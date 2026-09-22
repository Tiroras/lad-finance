import { localDate, monthKey } from "../shared/lib/dates";
import { receivedAmount, toBase } from "./currency";
import type { FinanceState, Goal } from "./types";

export function goalSaved(
  state: FinanceState,
  goal: Goal,
  today = localDate(),
) {
  return (
    goal.initialSaved +
    state.transactions
      .filter(
        (t) => t.type === "transfer" && t.goalId === goal.id && t.date <= today,
      )
      .reduce((sum, t) => sum + receivedAmount(t), 0)
  );
}

export function goalReserve(state: FinanceState, today = localDate()) {
  return state.goals.reduce((sum, goal) => {
    const contributed = state.transactions
      .filter(
        (t) =>
          t.goalId === goal.id &&
          t.type === "transfer" &&
          monthKey(t.date) === monthKey(today) &&
          t.date <= today,
      )
      .reduce((n, t) => n + receivedAmount(t), 0);
    return (
      sum +
      toBase(
        state,
        Math.max(
          0,
          Math.min(
            goal.target - goalSaved(state, goal, today),
            goal.monthly - contributed,
          ),
        ),
        goal.currency,
      )
    );
  }, 0);
}
