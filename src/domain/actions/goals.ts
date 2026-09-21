import { currencyRate, type CurrencyCode } from "../currency";
import { goalSaved, localDate, uid } from "../finance";
import type { FinanceState, Goal } from "../types";
import { saveTransaction } from "./transactions";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  ensure,
} from "./validation";

export type GoalInput = Pick<Goal, "name" | "target" | "monthly" | "icon"> & {
  id?: string;
  currency?: CurrencyCode;
};

export function saveGoal(
  state: FinanceState,
  input: GoalInput,
  today = localDate(),
): FinanceState {
  const original = state.goals.find((g) => g.id === input.id);
  ensure(!input.id || original, "Цель уже удалена.");
  ensure(
    original || state.goals.length < 100,
    "Можно создать не более 100 целей.",
  );
  const currency = input.currency ?? original?.currency ?? "RUB";
  ensure(
    !original || (original.currency ?? "RUB") === currency,
    "Валюту существующей цели менять нельзя.",
  );
  currencyRate(state, currency);
  checkName(input.name);
  checkAmount(input.target);
  checkAmount(input.monthly, true);
  ensure(
    !original || input.target >= goalSaved(state, original, today),
    "Сумма цели не может быть меньше уже накопленного.",
  );
  const goal: Goal = {
    ...input,
    currency,
    name: input.name.trim(),
    id: original?.id ?? uid(),
    initialSaved: original?.initialSaved ?? 0,
    color: input.icon === "shield-checkmark-outline" ? "#EFECF7" : "#EAF0E8",
  };
  const next: FinanceState = {
    ...state,
    goals: original
      ? state.goals.map((g) => (g.id === goal.id ? goal : g))
      : [...state.goals, goal],
  };

  checkCurrencyAmounts(next, today);
  return next;
}

export function deleteGoal(state: FinanceState, id: string): FinanceState {
  return {
    ...state,
    goals: state.goals.filter((g) => g.id !== id),
    transactions: state.transactions.map((t) =>
      t.goalId === id ? { ...t, goalId: undefined } : t,
    ),
  };
}

export function fundGoal(
  state: FinanceState,
  input: {
    goalId: string;
    amount: number;
    accountId: string;
    toAccountId?: string;
    toAmount?: number;
  },
  today = localDate(),
): FinanceState {
  const goal = state.goals.find((g) => g.id === input.goalId);
  ensure(goal, "Цель уже удалена.");
  const destination = state.accounts.find(
    (a) =>
      a.kind === "savings" &&
      (a.currency ?? "RUB") === (goal.currency ?? "RUB") &&
      (!input.toAccountId || a.id === input.toAccountId),
  );
  ensure(
    destination,
    `Добавьте накопительный счёт в валюте ${goal.currency ?? "RUB"}.`,
  );
  return saveTransaction(
    state,
    {
      type: "transfer",
      title: goal.name,
      amount: input.amount,
      toAmount: input.toAmount,
      date: today,
      category: "other",
      accountId: input.accountId,
      toAccountId: destination.id,
      goalId: goal.id,
    },
    today,
  );
}
