import { validateScenarioCurrencies } from "../scenarios";
import { debtBalance, creditPaymentRemaining } from "../debts";
import { accountToBase, CURRENCY_CODES, MAX_MONEY, toBase } from "../currency";
import { accountBalances } from "../accountBalances";
import { goalContributions } from "../goals";
import type { FinanceState } from "../types";
import { validatePaymentCapacity } from "../payments";
import { validateBudgetCapacity } from "../budgets";
import { pendingHolds } from "../transactionStatus";

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
  const balances = accountBalances(state, today);
  const held = pendingHolds(state);
  const contributions = goalContributions(state, today);
  for (const currency of CURRENCY_CODES) {
    const allocated = state.goals
      .filter((g) => (g.currency ?? "RUB") === currency)
      .reduce(
        (sum, goal) =>
          sum + goal.initialSaved + (contributions.get(goal.id)?.total ?? 0),
        0,
      );
    const savings = state.accounts
      .filter((a) => a.kind === "savings" && (a.currency ?? "RUB") === currency)
      .reduce(
        (sum, a) => sum + (balances.get(a.id) ?? 0) - (held.get(a.id) ?? 0),
        0,
      );
    ensure(
      savings >= allocated,
      "Эти накопления распределены по целям. Сначала освободите средства в целях.",
    );
  }
}

// Leave headroom for summing accounts and forecast events without unsafe integers.
export function checkBalanceCapacity(
  state: FinanceState,
  balances: ReadonlyMap<string, number>,
) {
  const totalMagnitude = state.accounts.reduce(
    (sum, account) =>
      sum +
      Math.abs(accountToBase(state, balances.get(account.id) ?? 0, account.id)),
    0,
  );
  ensure(
    Number.isSafeInteger(totalMagnitude) &&
      totalMagnitude <= Number.MAX_SAFE_INTEGER / 2,
    "Результат пересчёта остатков слишком велик. Проверьте курсы.",
  );
}

export function checkCurrencyAmounts(state: FinanceState, today: string) {
  validatePaymentCapacity(state, today);
  validateBudgetCapacity(state);
  for (const scenario of state.scenarios ?? [])
    validateScenarioCurrencies(state, scenario);
  checkBalanceCapacity(state, accountBalances(state, today));
  const balances = accountBalances(state, today);
  for (const [id, held] of pendingHolds(state))
    balances.set(id, (balances.get(id) ?? 0) - held);
  checkBalanceCapacity(state, balances);
  for (const goal of state.goals) {
    checkAmount(toBase(state, goal.target, goal.currency), true);
    checkAmount(toBase(state, goal.monthly, goal.currency), true);
  }
  for (const plan of [...state.recurring, ...(state.plannedIncomes ?? [])])
    checkAmount(accountToBase(state, plan.amount, plan.accountId), true);
  for (const plan of state.recurring)
    for (const rule of [...(plan.history ?? []), ...(plan.amountHistory ?? [])])
      checkAmount(accountToBase(state, rule.amount, plan.accountId), true);
  for (const plan of [...state.recurring, ...(state.plannedIncomes ?? [])])
    for (const version of plan.versions ?? [])
      checkAmount(
        accountToBase(state, version.amount, version.accountId),
        true,
      );
  for (const plan of state.recurring)
    for (const version of plan.versions ?? [])
      for (const rule of [
        ...(version.history ?? []),
        ...(version.amountHistory ?? []),
      ])
        checkAmount(accountToBase(state, rule.amount, version.accountId), true);
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
