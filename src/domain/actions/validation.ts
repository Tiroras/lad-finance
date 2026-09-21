import { accountBalance, goalSaved, MAX_MONEY } from "../finance";
import type { FinanceState } from "../types";

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function checkAmount(value: number, zero = false) {
  ensure(
    Number.isSafeInteger(value) &&
      value >= (zero ? 0 : 1) &&
      value <= MAX_MONEY,
    zero
      ? "Введите сумму от 0 до 1 млрд ₽."
      : "Введите сумму больше нуля, не более 1 млрд ₽.",
  );
}

export function checkName(value: string) {
  ensure(
    value.trim().length > 0 && value.trim().length <= 120,
    "Укажите название до 120 символов.",
  );
}

export function checkDay(value: number) {
  ensure(
    Number.isInteger(value) && value >= 1 && value <= 31,
    "Укажите день от 1 до 31.",
  );
}

export function checkSavings(state: FinanceState, today: string) {
  const allocated = state.goals.reduce(
    (sum, goal) => sum + goalSaved(state, goal, today),
    0,
  );
  const savings = state.accounts
    .filter((a) => a.kind === "savings")
    .reduce((sum, a) => sum + accountBalance(state, a.id, today), 0);
  ensure(
    savings >= allocated,
    "Эти накопления распределены по целям. Сначала освободите средства в целях.",
  );
}
