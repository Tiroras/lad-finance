import { validateTransactionAmountsState } from "../transactionAmounts";
import { accountBalances } from "../accountBalances";
import { validateAccountArchives } from "../accountArchive";
import { validateDebts, validateCreditAccounts } from "../debts";
import { accountCurrency, accountToBase, MAX_MONEY } from "../currency";
import { localDate, uid, validateTransaction } from "../finance";
import type { FinanceState, Transaction } from "../types";
import {
  isPosted,
  transactionStatus,
  transactionStatusError,
} from "../transactionStatus";
import {
  checkBalanceCapacity,
  checkCurrencyAmounts,
  checkSavings,
  ensure,
} from "./validation";

export type TransactionInput = Omit<Transaction, "id"> & {
  id?: string;
  createId?: string;
  expectedOriginal?: Transaction;
};

export function sameTransaction(a: Transaction, b: Transaction) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, child]) => child !== undefined)
              .sort(([first], [second]) => first.localeCompare(second))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function prepareTransaction(
  state: FinanceState,
  transaction: Transaction,
  today: string,
  allowArchived: boolean,
): Transaction {
  ensure(
    transactionStatus(transaction) !== "cancelled",
    "Отменённую операцию нельзя записать повторно. Создайте новое ожидание.",
  );
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
  validateAccountArchives(state, today);
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
  const next: FinanceState = {
    ...state,
    ...(valued.status !== undefined || valued.expectedDate !== undefined
      ? { version: 5 as const }
      : {}),
    transactions: [valued, ...state.transactions],
  };
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
      isPosted(transaction) &&
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
    ...(transactions.some(
      (entry) => entry.status !== undefined || entry.expectedDate !== undefined,
    )
      ? { version: 5 as const }
      : {}),
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
  ensure(
    input.id === undefined || input.createId === undefined,
    "Не смешивайте редактирование и создание операции.",
  );
  ensure(
    input.createId === undefined ||
      (input.createId.length > 0 && input.createId.length <= 100),
    "Некорректный ID новой операции.",
  );
  const original = input.id
    ? state.transactions.find((t) => t.id === input.id)
    : undefined;
  ensure(!input.id || original, "Операция уже удалена. Откройте форму заново.");
  ensure(
    !original ||
      !state.accounts.some(
        (account) =>
          account.archived &&
          (account.id === original.accountId ||
            account.id === original.toAccountId),
      ),
    "Сначала восстановите счёт из архива, чтобы изменить его историю.",
  );
  ensure(
    !input.expectedOriginal ||
      (original && sameTransaction(original, input.expectedOriginal)),
    "Операция изменилась после открытия формы. Проверьте актуальные данные и подтвердите замену.",
  );
  ensure(
    !original || transactionStatus(original) !== "cancelled",
    "Отменённая операция остаётся в истории. Создайте новое ожидание.",
  );
  ensure(
    !original ||
      transactionStatus(original) ===
        (input.status ?? transactionStatus(original)),
    "Измените статус действием «Провести» или «Отменить».",
  );
  const existingCreate = input.createId
    ? state.transactions.find((entry) => entry.id === input.createId)
    : undefined;
  // Validate intent-specific fields before type normalization can discard an
  // illegal refund, debt or goal link and silently save a different operation.
  const statusError = transactionStatusError({
    ...input,
    id: input.id ?? input.createId ?? "new",
    status: input.status ?? original?.status,
  });
  ensure(!statusError, statusError ?? "Некорректный статус операции.");
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
  const { createId, expectedOriginal: _expectedOriginal, ...fields } = input;
  const requestedStatus = input.status ?? original?.status;
  // Absence already means posted. Ordinary form saves must not inflate a
  // legacy snapshot (which may only shrink), or change its format merely
  // because the UI names that default. Preserve an explicit posting receipt.
  // The existing row also decides representation for a once-only create retry,
  // independently of later profile promotion to v5.
  const storedStatus =
    requestedStatus === undefined || requestedStatus === "posted"
      ? original?.status === "posted" || existingCreate?.status === "posted"
        ? ("posted" as const)
        : undefined
      : requestedStatus;
  const transaction: Transaction = {
    ...fields,
    id: original?.id ?? createId ?? uid(),
    status: storedStatus,
    baseAmount:
      input.baseAmount ??
      ((original ?? existingCreate)?.amount === input.amount &&
      (original ?? existingCreate)?.accountId === input.accountId
        ? (original ?? existingCreate)?.baseAmount
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
  if (existingCreate) {
    // This is a receipt lookup, not another monetary action: later spending or
    // archiving must not revalidate an already committed identical movement.
    ensure(
      sameTransaction(transaction, existingCreate),
      "Этот ID уже занят другой операцией. Проверьте сохранённую запись; она не изменена.",
    );
    return state;
  }
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
  const original = state.transactions.find((entry) => entry.id === id);
  ensure(
    !original ||
      !isPosted(original) ||
      !state.accounts.some(
        (account) =>
          account.archived &&
          (account.id === original.accountId ||
            account.id === original.toAccountId),
      ),
    "Сначала восстановите счёт из архива, чтобы изменить его историю.",
  );
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
  validateAccountArchives(next, today);
  return next;
}

export function postPendingTransaction(
  state: FinanceState,
  id: string,
  date: string,
  today = localDate(),
): FinanceState {
  const original = state.transactions.find((entry) => entry.id === id);
  ensure(original, "Операция уже удалена.");
  if (isPosted(original)) return state;
  ensure(
    transactionStatus(original) === "pending",
    "Отменённую операцию нельзя провести. Создайте новое ожидание.",
  );
  const {
    expectedDate: _expectedDate,
    baseAmount: _baseAmount,
    ...fields
  } = original;
  const withoutOriginal = {
    ...state,
    transactions: state.transactions.filter((entry) => entry.id !== id),
  };
  // Removing the intent before validation releases its own hold, while all
  // other reservations still constrain the new fact and its current FX value.
  return appendTransaction(
    withoutOriginal,
    { ...fields, status: "posted", date },
    today,
    true,
  );
}

export function cancelPendingTransaction(
  state: FinanceState,
  id: string,
  today = localDate(),
): FinanceState {
  const original = state.transactions.find((entry) => entry.id === id);
  ensure(original, "Операция уже удалена.");
  if (transactionStatus(original) === "cancelled") return state;
  ensure(
    transactionStatus(original) === "pending",
    "Проведённый факт нельзя отменить как ожидание. Исправьте или удалите операцию.",
  );
  const next: FinanceState = {
    ...state,
    version: 5,
    transactions: state.transactions.map((entry) =>
      entry.id === id ? { ...entry, status: "cancelled" } : entry,
    ),
  };
  checkSavings(next, today);
  validateAppendedState(next, today);
  return next;
}
