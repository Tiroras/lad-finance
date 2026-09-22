import { accountCurrency, MAX_MONEY, transactionValue } from "./currency";
import type { FinanceState, Transaction } from "./types";

export interface ExpenseContribution {
  category: string;
  amount: number;
}

// Largest remainders preserve the exact total, including zero-valued minor units.
// BigInt avoids multiplying two otherwise safe monetary integers as a float.
export function allocateAmount(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, value) => sum + BigInt(value), 0n);
  if (!weights.length || weightTotal <= 0n) return [];
  const allocated = weights.map((weight, index) => {
    const product = BigInt(total) * BigInt(weight);
    return {
      index,
      value: Number(product / weightTotal),
      remainder: product % weightTotal,
    };
  });
  let remaining =
    total - allocated.reduce((sum, entry) => sum + entry.value, 0);
  const ranked = [...allocated].sort((a, b) =>
    a.remainder > b.remainder
      ? -1
      : a.remainder < b.remainder
        ? 1
        : a.index - b.index,
  );
  for (const entry of ranked) {
    if (remaining <= 0) break;
    entry.value += 1;
    remaining -= 1;
  }
  return allocated.map((entry) => entry.value);
}

export function expenseContributions(
  state: FinanceState,
  transaction: Transaction,
): ExpenseContribution[] {
  if (transaction.debtId) return [];
  const original = transaction.refundOf
    ? state.transactions.find(
        (entry) =>
          entry.id === transaction.refundOf && entry.type === "expense",
      )
    : undefined;
  if (transaction.type !== "expense" && !original) return [];
  const source = original ?? transaction;
  const parts = source.splits ?? [
    { category: source.category, amount: source.amount },
  ];
  if (!original) {
    const allocated = allocateAmount(
      transactionValue(state, transaction),
      parts.map((part) => part.amount),
    );
    return parts.map((part, index) => ({
      category: part.category,
      amount: allocated[index],
    }));
  }
  // Apportion each refund over the remaining historical category values. This
  // keeps repeated one-minor-unit refunds from always consuming the first part.
  const initial = allocateAmount(
    transactionValue(state, original),
    parts.map((part) => part.amount),
  );
  let remaining = [...initial];
  const refunds = [
    ...state.transactions.filter(
      (entry) => entry.refundOf === original.id && entry.id !== transaction.id,
    ),
    transaction,
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const refund of refunds) {
    const value = transactionValue(state, refund);
    const available = remaining.reduce((sum, amount) => sum + amount, 0);
    const covered = Math.min(value, available);
    const allocated = available
      ? allocateAmount(covered, remaining)
      : remaining.map(() => 0);
    if (value > available) {
      const excess = allocateAmount(
        value - available,
        parts.map((part) => part.amount),
      );
      allocated.forEach((_, index) => {
        allocated[index] += excess[index];
      });
    }
    if (refund.id === transaction.id)
      return parts.map((part, index) => ({
        category: part.category,
        amount: -allocated[index],
      }));
    remaining = remaining.map((amount, index) =>
      Math.max(0, amount - allocated[index]),
    );
  }
  return [];
}

export const transactionIncomeAmount = (
  state: FinanceState,
  transaction: Transaction,
) =>
  transaction.type === "income" && !transaction.refundOf && !transaction.debtId
    ? transactionValue(state, transaction)
    : 0;

export const refundPrincipal = (transaction: Transaction) =>
  transaction.refundSourceAmount ?? transaction.amount;

export function refundedAmount(
  state: FinanceState,
  expenseId: string,
  excludeId?: string,
) {
  return state.transactions
    .filter((entry) => entry.refundOf === expenseId && entry.id !== excludeId)
    .reduce((sum, entry) => sum + refundPrincipal(entry), 0);
}

export function transactionAmountsError(
  state: FinanceState,
  transaction: Transaction,
): string | undefined {
  if (transaction.splits !== undefined) {
    if (
      transaction.type !== "expense" ||
      transaction.refundOf ||
      transaction.debtId
    )
      return "Разделить по категориям можно только обычный расход.";
    if (transaction.splits.length < 2 || transaction.splits.length > 50)
      return "Укажите от 2 до 50 частей покупки.";
    if (
      new Set(transaction.splits.map((part) => part.category)).size !==
      transaction.splits.length
    )
      return "Объедините части с одинаковой категорией.";
    for (const part of transaction.splits) {
      if (!state.categories.some((category) => category.id === part.category))
        return "Выберите категорию для каждой части покупки.";
      if (
        !Number.isSafeInteger(part.amount) ||
        part.amount <= 0 ||
        part.amount > MAX_MONEY
      )
        return "Сумма каждой части должна быть положительной.";
    }
    if (
      transaction.splits.reduce(
        (sum, part) => sum + BigInt(part.amount),
        0n,
      ) !== BigInt(transaction.amount)
    )
      return "Сумма частей должна совпадать с общей суммой покупки.";
  }
  if (transaction.refundSourceAmount !== undefined && !transaction.refundOf)
    return "Сумма возвращённой части допустима только для связанного возврата.";
  if (!transaction.refundOf) return undefined;
  if (
    transaction.type !== "income" ||
    transaction.plannedIncomeId ||
    transaction.recurringId ||
    transaction.goalId ||
    transaction.debtId
  )
    return "Возврат должен быть отдельным поступлением, без связи с планом или долгом.";
  const original = state.transactions.find(
    (entry) =>
      entry.id === transaction.refundOf &&
      entry.type === "expense" &&
      !entry.refundOf &&
      !entry.debtId,
  );
  if (!original || original.id === transaction.id)
    return "Покупка для возврата не найдена.";
  if (transaction.date < original.date)
    return "Дата возврата не может быть раньше покупки.";
  const sameCurrency =
    accountCurrency(state, transaction.accountId) ===
    accountCurrency(state, original.accountId);
  if (!sameCurrency && transaction.refundSourceAmount === undefined)
    return "Укажите возвращённую часть в валюте исходной покупки.";
  if (
    sameCurrency &&
    transaction.refundSourceAmount !== undefined &&
    transaction.refundSourceAmount !== transaction.amount
  )
    return "Возврат в валюте покупки должен совпадать с суммой поступления.";
  const principal = refundPrincipal(transaction);
  if (
    !Number.isSafeInteger(principal) ||
    principal <= 0 ||
    principal > MAX_MONEY
  )
    return "Укажите положительную возвращённую сумму в валюте покупки.";
  if (
    refundedAmount(state, original.id, transaction.id) + principal >
    original.amount
  )
    return "Сумма возвратов превышает сумму исходной покупки.";
  return undefined;
}

export function validateTransactionAmountsState(state: FinanceState) {
  for (const transaction of state.transactions) {
    const error = transactionAmountsError(state, transaction);
    if (error) throw new Error(error);
  }
}
