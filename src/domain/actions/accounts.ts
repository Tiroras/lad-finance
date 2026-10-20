import { validateGoalFunds } from "../goalFunds";
import { CURRENCY_CODES, currencyRate, type CurrencyCode } from "../currency";
import { accountBalance, localDate, MAX_MONEY, uid } from "../finance";
import type { Account, FinanceState } from "../types";
import { validateCreditAccounts } from "../debts";
import { isPosted } from "../transactionStatus";
import { validateAccountArchives } from "../accountArchive";
import { validDate } from "../../shared/lib/dates";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  checkSavings,
  ensure,
} from "./validation";

export interface AccountInput {
  id?: string;
  name: string;
  kind: Account["kind"];
  balance: number;
  currency?: CurrencyCode;
  creditLimit?: number;
  paymentDueDate?: string;
  paymentDueAmount?: number;
  creditTermsReminderDate?: string;
}

export interface CreditTermsInput {
  accountId: string;
  paymentDueAmount: number;
  paymentDueDate?: string;
  reminderDate?: string;
}

/** An explicit statement confirmation is a new snapshot, even at the same amount. */
export function confirmCreditTerms(
  state: FinanceState,
  input: CreditTermsInput,
  today = localDate(),
): FinanceState {
  const original = state.accounts.find((entry) => entry.id === input.accountId);
  ensure(
    original?.kind === "credit" && !original.archived,
    "Выберите активную кредитную карту.",
  );
  checkAmount(input.paymentDueAmount, true);
  ensure(validDate(today), "Проверьте дату подтверждения выписки.");
  const reminderDate =
    input.reminderDate === undefined
      ? original.creditTermsReminderDate
      : input.reminderDate || undefined;
  if (input.reminderDate !== undefined)
    ensure(
      !reminderDate || (validDate(reminderDate) && reminderDate >= today),
      "Выберите дату напоминания не раньше сегодняшней.",
    );
  const next: FinanceState = {
    ...state,
    version: state.version >= 7 ? state.version : 7,
    accounts: state.accounts.map((account) =>
      account.id === original.id
        ? {
            ...account,
            paymentDueAmount: input.paymentDueAmount,
            paymentDueDate: input.paymentDueDate || undefined,
            paymentDueBaselineIds: state.transactions
              .filter(
                (transaction) =>
                  transaction.type === "transfer" &&
                  isPosted(transaction) &&
                  transaction.toAccountId === account.id &&
                  transaction.date <= today,
              )
              .map((transaction) => transaction.id),
            creditTermsConfirmedOn: today,
            creditTermsReminderDate: reminderDate,
          }
        : account,
    ),
  };
  validateCreditAccounts(next, today);
  validateAccountArchives(next, today);
  checkCurrencyAmounts(next, today);
  return next;
}

export function saveCreditTermsReminder(
  state: FinanceState,
  accountId: string,
  reminderDate: string,
  today = localDate(),
): FinanceState {
  ensure(
    state.accounts.some(
      (account) =>
        account.id === accountId &&
        account.kind === "credit" &&
        !account.archived,
    ),
    "Выберите активную кредитную карту.",
  );
  ensure(
    !reminderDate || (validDate(reminderDate) && reminderDate >= today),
    "Выберите дату напоминания не раньше сегодняшней.",
  );
  const next: FinanceState = {
    ...state,
    version: state.version >= 7 ? state.version : 7,
    accounts: state.accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            creditTermsReminderDate: reminderDate || undefined,
          }
        : account,
    ),
  };
  validateCreditAccounts(next, today);
  return next;
}
export function saveAccount(
  state: FinanceState,
  input: AccountInput,
  today = localDate(),
): FinanceState {
  const original = state.accounts.find((a) => a.id === input.id);
  ensure(!input.id || original, "Счёт уже удалён.");
  ensure(
    original || state.accounts.length < 30,
    "Можно создать не более 30 счетов.",
  );
  ensure(
    !original || input.kind === original.kind,
    "Тип существующего счёта менять нельзя.",
  );
  const currency = input.currency ?? original?.currency ?? "RUB";
  ensure(
    !original || (original.currency ?? "RUB") === currency,
    "Валюту существующего счёта менять нельзя. Создайте новый счёт и выполните перевод.",
  );
  currencyRate(state, currency);
  checkName(input.name);
  ensure(
    ["spending", "savings", "credit"].includes(input.kind),
    "Выберите тип счёта.",
  );
  if (input.kind === "credit" || original)
    checkAmount(Math.abs(input.balance), true);
  else checkAmount(input.balance, true);
  const openingBalance = original?.openingBalance ?? input.balance;
  const adjustment = original
    ? input.balance - accountBalance(state, original.id, today)
    : 0;
  ensure(
    !original?.archived || adjustment === 0,
    "Сначала восстановите счёт из архива, чтобы корректировать остаток.",
  );
  ensure(
    Math.abs(adjustment) <= MAX_MONEY,
    "Корректировка остатка превышает допустимый лимит.",
  );
  ensure(
    !adjustment || (state.balanceAdjustments?.length ?? 0) < 5000,
    "Достигнут лимит корректировок остатков.",
  );
  const creditLimit = input.creditLimit ?? original?.creditLimit;
  const paymentDueDate =
    input.paymentDueDate === undefined
      ? original?.paymentDueDate
      : input.paymentDueDate || undefined;
  const paymentDueAmount =
    input.paymentDueAmount ?? original?.paymentDueAmount ?? 0;
  const dueChanged =
    !original ||
    original.paymentDueDate !== paymentDueDate ||
    (original.paymentDueAmount ?? 0) !== paymentDueAmount;
  const account: Account = {
    id: original?.id ?? uid(),
    name: input.name.trim(),
    kind: input.kind,
    openingBalance,
    currency,
    icon:
      original?.icon ??
      (input.kind === "savings" ? "wallet-outline" : "card-outline"),
    color: original?.color ?? "#234B3C",
    ...(original?.archived !== undefined
      ? { archived: original.archived }
      : {}),
    ...(input.kind === "credit"
      ? {
          creditLimit,
          paymentDueDate,
          paymentDueAmount,
          paymentDueBaselineIds: dueChanged
            ? state.transactions
                .filter(
                  (transaction) =>
                    transaction.type === "transfer" &&
                    isPosted(transaction) &&
                    transaction.toAccountId === original?.id &&
                    transaction.date <= today,
                )
                .map((transaction) => transaction.id)
            : (original?.paymentDueBaselineIds ?? []),
          ...(original?.creditTermsConfirmedOn !== undefined
            ? { creditTermsConfirmedOn: original.creditTermsConfirmedOn }
            : {}),
          ...(original?.creditTermsReminderDate !== undefined
            ? { creditTermsReminderDate: original.creditTermsReminderDate }
            : {}),
        }
      : {}),
  };
  const next: FinanceState = {
    ...state,
    accounts: original
      ? state.accounts.map((a) => (a.id === account.id ? account : a))
      : [...state.accounts, account],
    ...(adjustment
      ? {
          balanceAdjustments: [
            ...(state.balanceAdjustments ?? []),
            {
              id: uid(),
              accountId: account.id,
              date: today,
              amount: adjustment,
              note: "Изменение остатка в настройках",
            },
          ],
        }
      : {}),
  };
  for (const code of CURRENCY_CODES) {
    const initialGoals = next.goals
      .filter((g) => (g.currency ?? "RUB") === code)
      .reduce((sum, g) => sum + g.initialSaved, 0);
    ensure(
      next.accounts
        .filter((a) => a.kind === "savings" && (a.currency ?? "RUB") === code)
        .reduce((sum, a) => sum + a.openingBalance, 0) >= initialGoals,
      "Начальный остаток меньше средств, распределённых по целям.",
    );
  }
  checkSavings(next, today);
  validateGoalFunds(next, today);
  validateAccountArchives(next, today);
  validateCreditAccounts(next, today);
  checkCurrencyAmounts(next, today);
  if (
    input.kind === "credit" &&
    dueChanged &&
    (input.paymentDueAmount !== undefined || input.paymentDueDate !== undefined)
  )
    return confirmCreditTerms(
      next,
      {
        accountId: account.id,
        paymentDueAmount,
        paymentDueDate,
        reminderDate: input.creditTermsReminderDate,
      },
      today,
    );
  return next;
}
