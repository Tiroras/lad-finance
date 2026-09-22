import { validateScenarioCurrencies } from "../scenarios";
import { debtBalance, creditPaymentRemaining } from "../debts";
import {
  accountToBase,
  CURRENCY_CODES,
  receivedAmount,
  toBase,
} from "../currency";
import { accountBalance, goalSaved, MAX_MONEY } from "../finance";
import type { FinanceState } from "../types";
import { validatePaymentCapacity } from "../payments";
import { validateBudgetCapacity } from "../budgets";

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function checkAmount(value: number, zero = false) {
  ensure(
    Number.isSafeInteger(value) &&
      value >= (zero ? 0 : 1) &&
      value <= MAX_MONEY,
    zero
      ? "Введите неотрицательную сумму в пределах допустимого лимита."
      : "Введите положительную сумму в пределах допустимого лимита.",
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
  for (const currency of CURRENCY_CODES) {
    const allocated = state.goals
      .filter((g) => (g.currency ?? "RUB") === currency)
      .reduce((sum, goal) => sum + goalSaved(state, goal, today), 0);
    const savings = state.accounts
      .filter((a) => a.kind === "savings" && (a.currency ?? "RUB") === currency)
      .reduce((sum, a) => sum + accountBalance(state, a.id, today), 0);
    ensure(
      savings >= allocated,
      "Эти накопления распределены по целям. Сначала освободите средства в целях.",
    );
  }
}

// Leave headroom for summing accounts and forecast events without unsafe integers.
export function checkCurrencyAmounts(state: FinanceState, today: string) {
  validatePaymentCapacity(state, today);
  validateBudgetCapacity(state);
  for (const scenario of state.scenarios ?? [])
    validateScenarioCurrencies(state, scenario);
  const balances = new Map(state.accounts.map((a) => [a.id, a.openingBalance]));
  for (const t of state.transactions) {
    if (t.date > today) continue;
    balances.set(
      t.accountId,
      (balances.get(t.accountId) ?? 0) +
        (t.type === "income" ? t.amount : -t.amount),
    );
    if (t.type === "transfer" && t.toAccountId)
      balances.set(
        t.toAccountId,
        (balances.get(t.toAccountId) ?? 0) + receivedAmount(t),
      );
  }
  const totalMagnitude = state.accounts.reduce(
    (sum, account) =>
      sum +
      Math.abs(
        accountToBase(
          state,
          (balances.get(account.id) ?? 0) +
            (state.balanceAdjustments ?? [])
              .filter((a) => a.accountId === account.id && a.date <= today)
              .reduce((n, a) => n + a.amount, 0),
          account.id,
        ),
      ),
    0,
  );
  ensure(
    Number.isSafeInteger(totalMagnitude) &&
      totalMagnitude <= Number.MAX_SAFE_INTEGER / 2,
    "Результат пересчёта остатков слишком велик. Проверьте курсы.",
  );
  for (const goal of state.goals) {
    checkAmount(toBase(state, goal.target, goal.currency), true);
    checkAmount(toBase(state, goal.monthly, goal.currency), true);
  }
  for (const plan of [...state.recurring, ...(state.plannedIncomes ?? [])])
    checkAmount(accountToBase(state, plan.amount, plan.accountId), true);
  for (const plan of state.recurring)
    for (const rule of [...(plan.history ?? []), ...(plan.amountHistory ?? [])])
      checkAmount(accountToBase(state, rule.amount, plan.accountId), true);
  for (const debt of state.debts ?? [])
    checkAmount(
      accountToBase(state, debtBalance(state, debt, today), debt.accountId),
      true,
    );
  for (const account of state.accounts)
    if (account.kind === "credit")
      checkAmount(
        accountToBase(
          state,
          creditPaymentRemaining(state, account, today),
          account.id,
        ),
        true,
      );
}
