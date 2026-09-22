import { validateTransactionAmountsState } from "../transactionAmounts";
import { accountBalances } from "../accountBalances";
import { validateDebts, validateCreditAccounts } from "../debts";
import { accountCurrency, accountToBase, MAX_MONEY } from "../currency";
import { localDate, uid, validateTransaction } from "../finance";
import type { FinanceState, Transaction } from "../types";
import {
  checkBalanceCapacity,
  checkCurrencyAmounts,
  checkSavings,
  ensure,
} from "./validation";

export type TransactionInput = Omit<Transaction, "id"> & { id?: string };

function prepareTransaction(
  state: FinanceState,
  transaction: Transaction,
  today: string,
  allowArchived: boolean,
): Transaction {
  const error = validateTransaction(state, transaction, today);
  ensure(!error, error ?? "Некорректная операция.");
  ensure(
    allowArchived ||
      (!!transaction.refundOf &&
        state.transactions.some(
          (entry) =>
            entry.id === transaction.refundOf &&
            entry.type === "expense" &&
            entry.category === transaction.category,
        )) ||
      !state.categories.find((c) => c.id === transaction.category)?.archived ||
      state.recurring.some(
        (p) =>
          p.id === transaction.recurringId &&
          p.category === transaction.category,
      ),
    "Категория в архиве. Выберите активную категорию.",
  );
  ensure(
    allowArchived ||
      !transaction.splits?.some(
        (part) =>
          state.categories.find((category) => category.id === part.category)
            ?.archived,
      ),
    "Категория части в архиве. Выберите активную категорию.",
  );
  const valued = {
    ...transaction,
    baseAmount:
      transaction.baseAmount ??
      accountToBase(state, transaction.amount, transaction.accountId),
  };
  ensure(
    valued.baseAmount <= MAX_MONEY,
    "Сумма в основной валюте превышает допустимый лимит.",
  );
  return valued;
}

function validateAppendedState(state: FinanceState, today: string) {
  validateTransactionAmountsState(state);
  validateDebts(state, today);
  validateCreditAccounts(state, today);
  checkCurrencyAmounts(state, today);
}

// Every write validates against the latest state supplied by the store.
export function appendTransaction(
  state: FinanceState,
  transaction: Transaction,
  today = localDate(),
  allowArchived = false,
): FinanceState {
  ensure(
    state.transactions.length < 20000,
    "В учёте допустимо не более 20 000 операций.",
  );
  ensure(
    !state.transactions.some((t) => t.id === transaction.id),
    "Операция с таким ID уже существует.",
  );
  const valued = prepareTransaction(state, transaction, today, allowArchived);
  const next = { ...state, transactions: [valued, ...state.transactions] };
  if (
    transaction.type === "transfer" &&
    state.accounts.find((a) => a.id === transaction.accountId)?.kind ===
      "savings"
  )
    checkSavings(next, today);
  validateAppendedState(next, today);
  return next;
}

/** Atomic import. Input order is retained; dependent entries validate by date. */
export function appendTransactions(
  state: FinanceState,
  transactions: readonly Transaction[],
  today = localDate(),
): FinanceState {
  if (!transactions.length) return state;
  ensure(
    state.transactions.length + transactions.length <= 20000,
    "В учёте допустимо не более 20 000 операций.",
  );
  const spendingAccounts = new Set(
    state.accounts
      .filter((account) => account.kind === "spending")
      .map((account) => account.id),
  );
  // Unlinked spending-account entries cannot alter goals, debts, credit limits,
  // refunds or paid occurrences. Their budget capacity only grows. All other
  // batches retain sequential validation, including dated transfer constraints.
  const independent = transactions.every(
    (transaction) =>
      transaction.type !== "transfer" &&
      spendingAccounts.has(transaction.accountId) &&
      !transaction.refundOf &&
      !transaction.goalId &&
      !transaction.recurringId &&
      !transaction.plannedIncomeId &&
      !transaction.debtId &&
      !transaction.debtAction,
  );
  const ids = new Set(state.transactions.map((transaction) => transaction.id));
  const balances = independent ? accountBalances(state, today) : undefined;
  const added = new Map<string, Transaction>();
  let next = state;
  for (const transaction of [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  )) {
    try {
      if (balances) {
        ensure(!ids.has(transaction.id), "Операция с таким ID уже существует.");
        const valued = prepareTransaction(state, transaction, today, false);
        ids.add(valued.id);
        balances.set(
          valued.accountId,
          (balances.get(valued.accountId) ?? 0) +
            (valued.type === "income" ? valued.amount : -valued.amount),
        );
        checkBalanceCapacity(state, balances);
        added.set(valued.id, valued);
      } else {
        next = appendTransaction(next, transaction, today);
        added.set(transaction.id, next.transactions[0]);
      }
    } catch (error) {
      throw new Error(
        `«${transaction.title}»: ${error instanceof Error ? error.message : "Не удалось добавить операцию."}`,
      );
    }
  }
  next = {
    ...next,
    transactions: [
      ...transactions.map((transaction) => added.get(transaction.id)!),
      ...state.transactions,
    ],
  };
  if (independent) validateAppendedState(next, today);
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
  ensure(!original?.debtId, "Операции долга изменяются через раздел «Долги».");
  ensure(
    !original ||
      !state.transactions.some((entry) => entry.refundOf === original.id) ||
      accountCurrency(state, original.accountId) ===
        accountCurrency(state, input.accountId),
    "У покупки есть возвраты. Чтобы изменить валюту покупки, сначала удалите связанные возвраты и запишите их заново.",
  );
  ensure(
    !original?.goalId || input.type === "transfer",
    "Пополнение цели должно оставаться переводом между счетами.",
  );
  const transaction: Transaction = {
    ...input,
    id: original?.id ?? uid(),
    baseAmount:
      input.baseAmount ??
      (original?.amount === input.amount &&
      original.accountId === input.accountId
        ? original.baseAmount
        : undefined),
    toAmount: input.type === "transfer" ? input.toAmount : undefined,
    title:
      input.title.trim() ||
      (input.type === "transfer" ? "Перевод между счетами" : ""),
    note: input.note?.trim(),
    splits: input.type === "expense" ? input.splits : undefined,
    refundOf:
      input.type === "income"
        ? (original?.refundOf ?? input.refundOf)
        : undefined,
    refundSourceAmount:
      input.type === "income" ? input.refundSourceAmount : undefined,
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
  ensure(
    !original?.refundOf ||
      (input.type === "income" &&
        (!input.refundOf || input.refundOf === original.refundOf)),
    "Сохраните связь возврата с исходной покупкой.",
  );
  const protectedCategories = new Set(
    original?.splits?.map((part) => part.category) ?? [original?.category],
  );
  ensure(
    !transaction.splits?.some(
      (part) =>
        state.categories.find((category) => category.id === part.category)
          ?.archived && !protectedCategories.has(part.category),
    ),
    "Категория части в архиве. Выберите активную категорию.",
  );
  const withoutOriginal = {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== original?.id),
  };
  const next = appendTransaction(
    withoutOriginal,
    transaction,
    today,
    original?.category === transaction.category,
  );
  if (original) checkSavings(next, today);
  return next;
}

export function deleteTransaction(
  state: FinanceState,
  id: string,
  today = localDate(),
): FinanceState {
  ensure(
    !state.transactions.some((entry) => entry.refundOf === id),
    "У покупки есть возвраты. Сначала удалите связанные возвраты.",
  );
  const next = {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== id),
  };
  validateDebts(next, today);
  validateCreditAccounts(next, today);
  checkSavings(next, today);
  checkCurrencyAmounts(next, today);
  return next;
}
