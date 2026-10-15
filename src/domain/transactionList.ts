import { categoryMatches } from "./categories";
import {
  expenseContributions,
  transactionIncomeAmount,
} from "./transactionAmounts";
import type { FinanceState, Transaction } from "./types";
import { monthKey } from "../shared/lib/dates";
import { isPosted, transactionStatus } from "./transactionStatus";

export type TransactionFilterType = "all" | Transaction["type"] | "debt";
export type TransactionPeriod = "month" | "all";
export type TransactionFilterStatus =
  "all" | "posted" | "pending" | "cancelled";

export interface TransactionListFilters {
  month: string;
  period?: TransactionPeriod;
  query: string;
  type: TransactionFilterType;
  account: string;
  category: string;
  status?: TransactionFilterStatus;
}

/** Totals cover every match, independently of how many rows the UI displays. */
export function selectTransactionList(
  state: FinanceState,
  filters: TransactionListFilters,
  today: string,
) {
  const { month, period = "month", type, account, category } = filters;
  const query = filters.query.trim().toLocaleLowerCase("ru-RU");
  const matchesCategory = (id: string) =>
    category === "all" || categoryMatches(state, id, category);
  const transactions: Transaction[] = [];
  let income = 0;
  let expense = 0;

  for (const transaction of state.transactions) {
    if (
      (filters.status &&
        filters.status !== "all" &&
        transactionStatus(transaction) !== filters.status) ||
      (period === "month" && monthKey(transaction.date) !== month) ||
      transaction.date > today ||
      (account !== "all" &&
        transaction.accountId !== account &&
        transaction.toAccountId !== account) ||
      (query &&
        !`${transaction.title} ${transaction.note ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(query))
    )
      continue;

    if (
      (type === "debt" && !transaction.debtId) ||
      (type === "transfer" && transaction.type !== "transfer") ||
      (type === "income" &&
        (transaction.type !== "income" ||
          transaction.refundOf ||
          transaction.debtId))
    )
      continue;

    // Reuse split/refund allocation for type, category and totals, after cheap
    // filters have discarded unrelated entries.
    const parts = expenseContributions(state, transaction);
    const categories = isPosted(transaction)
      ? parts
      : (transaction.splits ?? [{ category: transaction.category, amount: 0 }]);
    if (
      type === "expense" &&
      (isPosted(transaction)
        ? parts.length === 0
        : transaction.type !== "expense")
    )
      continue;
    if (
      category !== "all" &&
      !(transaction.type === "expense" || transaction.refundOf
        ? categories.some((part) => matchesCategory(part.category))
        : !transaction.debtId && matchesCategory(transaction.category))
    )
      continue;

    transactions.push(transaction);
    income += transactionIncomeAmount(state, transaction);
    for (const part of parts)
      if (matchesCategory(part.category)) expense += part.amount;
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));
  return { transactions, income, expense };
}
