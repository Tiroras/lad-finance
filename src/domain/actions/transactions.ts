import { localDate, uid, validateTransaction } from "../finance";
import type { FinanceState, Transaction } from "../types";
import { checkSavings, ensure } from "./validation";

export type TransactionInput = Omit<Transaction, "id"> & { id?: string };

// Every write validates against the latest state supplied by the store.
export function appendTransaction(
  state: FinanceState,
  transaction: Transaction,
  today = localDate(),
): FinanceState {
  ensure(
    state.transactions.length < 20000,
    "В учёте допустимо не более 20 000 операций.",
  );
  ensure(
    !state.transactions.some((t) => t.id === transaction.id),
    "Операция с таким ID уже существует.",
  );
  const error = validateTransaction(state, transaction, today);
  ensure(!error, error ?? "Некорректная операция.");
  const next = { ...state, transactions: [transaction, ...state.transactions] };
  if (
    transaction.type === "transfer" &&
    state.accounts.find((a) => a.id === transaction.accountId)?.kind ===
      "savings"
  )
    checkSavings(next, today);
  return next;
}

export function saveTransaction(
  state: FinanceState,
  input: TransactionInput,
  today = localDate(),
): FinanceState {
  const original = input.id
    ? state.transactions.find((t) => t.id === input.id)
    : undefined;
  ensure(!input.id || original, "Операция уже удалена. Откройте форму заново.");
  ensure(
    !original?.goalId || input.type === "transfer",
    "Пополнение цели должно оставаться переводом между счетами.",
  );
  const transaction: Transaction = {
    ...input,
    id: original?.id ?? uid(),
    title:
      input.title.trim() ||
      (input.type === "transfer" ? "Перевод между счетами" : ""),
    note: input.note?.trim(),
    importKey: original?.importKey ?? input.importKey,
    toAccountId: input.type === "transfer" ? input.toAccountId : undefined,
    goalId:
      input.type === "transfer"
        ? (original?.goalId ?? input.goalId)
        : undefined,
    recurringId:
      input.type === "expense"
        ? (original?.recurringId ?? input.recurringId)
        : undefined,
    occurrenceDate:
      input.type === "expense"
        ? (original?.occurrenceDate ?? input.occurrenceDate)
        : undefined,
    plannedIncomeId:
      input.type === "income"
        ? (original?.plannedIncomeId ?? input.plannedIncomeId)
        : undefined,
    incomeOccurrenceDate:
      input.type === "income"
        ? (original?.incomeOccurrenceDate ?? input.incomeOccurrenceDate)
        : undefined,
  };
  const withoutOriginal = {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== original?.id),
  };
  const next = appendTransaction(withoutOriginal, transaction, today);
  if (original) checkSavings(next, today);
  return next;
}

export function deleteTransaction(
  state: FinanceState,
  id: string,
  today = localDate(),
): FinanceState {
  const next = {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== id),
  };
  checkSavings(next, today);
  return next;
}
