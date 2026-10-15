import { validDate } from "../shared/lib/dates";
import type { FinanceState, Transaction } from "./types";
import { accountToBase } from "./currency";

export type TransactionStatus = "posted" | "pending" | "cancelled";
export const transactionStatus = (
  transaction: Pick<Transaction, "status">,
): TransactionStatus => transaction.status ?? "posted";
export const isPosted = (transaction: Pick<Transaction, "status">) =>
  transactionStatus(transaction) === "posted";
export const isPostedAt = (transaction: Transaction, date: string) =>
  isPosted(transaction) && transaction.date <= date;

/** Current outstanding intentions, regardless of expected date or forecast horizon. */
export function pendingHolds(state: FinanceState) {
  const held = new Map<string, number>();
  for (const transaction of state.transactions) {
    if (
      transactionStatus(transaction) !== "pending" ||
      transaction.type === "income"
    )
      continue;
    const amount = (held.get(transaction.accountId) ?? 0) + transaction.amount;
    if (!Number.isSafeInteger(amount))
      throw new Error("Сумма ожидаемых списаний превышает допустимый лимит.");
    held.set(transaction.accountId, amount);
  }
  return held;
}

export function transactionStatusError(
  transaction: Transaction,
): string | null {
  const status = transactionStatus(transaction);
  if (!["posted", "pending", "cancelled"].includes(status))
    return "Неизвестный статус операции.";
  if (
    transaction.expectedDate !== undefined &&
    (!validDate(transaction.expectedDate) || status === "posted")
  )
    return "Ожидаемая дата допустима только у ожидающей или отменённой операции.";
  if (
    status !== "posted" &&
    (transaction.refundOf ||
      transaction.refundSourceAmount !== undefined ||
      transaction.debtId ||
      transaction.debtAction ||
      transaction.goalId)
  )
    return "Возвраты, движения долга и пополнения цели сохраняются только как проведённые операции.";
  return null;
}

/** Old readers must reject new semantics, rather than silently post a pending row. */
export function assertFinanceVersion(state: FinanceState) {
  if (
    state.version !== 5 &&
    (state.accounts.some((account) => account.archived !== undefined) ||
      state.transactions.some(
        (transaction) =>
          transaction.status !== undefined ||
          transaction.expectedDate !== undefined,
      ))
  )
    throw new Error(
      "Статусы операций и архив счетов требуют финансовый формат версии 5.",
    );
}

export function pendingProjection(
  transaction: Transaction,
  today: string,
): string | undefined {
  if (transactionStatus(transaction) !== "pending" || !transaction.expectedDate)
    return undefined;
  if (transaction.type === "income")
    return transaction.expectedDate >= today
      ? transaction.expectedDate
      : undefined;
  return transaction.expectedDate < today ? today : transaction.expectedDate;
}

export function spendingHeld(state: FinanceState): number {
  const accounts = new Set(
    state.accounts
      .filter((account) => account.kind === "spending")
      .map((account) => account.id),
  );
  return state.transactions.reduce(
    (held, transaction) =>
      held +
      (transactionStatus(transaction) === "pending" &&
      transaction.type !== "income" &&
      accounts.has(transaction.accountId)
        ? accountToBase(state, transaction.amount, transaction.accountId)
        : 0),
    0,
  );
}
