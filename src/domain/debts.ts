import { z } from "zod";
import { localDate, validDate } from "../shared/lib/dates";
import { accountBalance } from "./accountBalances";
import {
  accountCurrency,
  CURRENCY_CODES,
  currencyRate,
  MAX_MONEY,
  receivedAmount,
  type CurrencyCode,
} from "./currency";
import type { Account, FinanceState, Transaction } from "./types";
import { isPosted, pendingHolds, transactionStatus } from "./transactionStatus";

export interface Debt {
  id: string;
  name: string;
  direction: "lent" | "borrowed";
  currency: CurrencyCode;
  accountId: string;
  openingAmount: number;
  startsOn: string;
  dueDate?: string;
  note?: string;
}

const id = z.string().min(1).max(100);
const date = z.string().refine(validDate);
export const debtSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  direction: z.enum(["lent", "borrowed"]),
  currency: z.enum(CURRENCY_CODES),
  accountId: id,
  openingAmount: z.number().int().min(0).max(MAX_MONEY),
  startsOn: date,
  dueDate: date.optional(),
  note: z.string().max(500).optional(),
});

export function debtTransactionType(
  debt: Debt,
  action: "issue" | "repay",
): Transaction["type"] {
  return (debt.direction === "borrowed") === (action === "issue")
    ? "income"
    : "expense";
}

export function debtBalance(
  state: FinanceState,
  debt: Debt,
  today = localDate(),
) {
  if (debt.startsOn > today) return 0;
  return state.transactions
    .filter(
      (transaction) =>
        isPosted(transaction) &&
        transaction.debtId === debt.id &&
        transaction.date <= today,
    )
    .reduce(
      (balance, transaction) =>
        balance +
        (transaction.debtAction === "issue"
          ? transaction.amount
          : -transaction.amount),
      debt.openingAmount,
    );
}

export function creditOutstanding(
  state: FinanceState,
  account: Account,
  today = localDate(),
) {
  return Math.max(0, -accountBalance(state, account.id, today));
}

/** The entered due amount is a snapshot; later incoming transfers pay it down. */
export function creditPaymentRemaining(
  state: FinanceState,
  account: Account,
  today = localDate(),
) {
  const baseline = new Set(account.paymentDueBaselineIds ?? []);
  const paid = state.transactions
    .filter(
      (transaction) =>
        transaction.type === "transfer" &&
        isPosted(transaction) &&
        transaction.toAccountId === account.id &&
        transaction.date <= today &&
        !baseline.has(transaction.id),
    )
    .reduce((sum, transaction) => sum + receivedAmount(transaction), 0);
  return Math.min(
    creditOutstanding(state, account, today),
    Math.max(0, (account.paymentDueAmount ?? 0) - paid),
  );
}

export interface DebtObligation {
  id: string;
  name: string;
  accountId: string;
  amount: number;
  date: string;
  kind: "debt" | "credit";
}

/** Receivables are visible in debt cards, but never promise reliable future cash. */
export function debtObligations(
  state: FinanceState,
  today: string,
  end: string,
): DebtObligation[] {
  const result: DebtObligation[] = [];
  for (const debt of state.debts ?? []) {
    const amount = debtBalance(state, debt, today);
    if (
      debt.direction === "borrowed" &&
      debt.dueDate &&
      debt.dueDate <= end &&
      amount > 0
    )
      result.push({
        id: debt.id,
        name: debt.name,
        accountId: debt.accountId,
        amount,
        date: debt.dueDate,
        kind: "debt",
      });
  }
  for (const account of state.accounts) {
    if (
      account.kind !== "credit" ||
      !account.paymentDueDate ||
      account.paymentDueDate > end
    )
      continue;
    const amount = creditPaymentRemaining(state, account, today);
    if (amount > 0)
      result.push({
        id: account.id,
        name: account.name,
        accountId: account.id,
        amount,
        date: account.paymentDueDate,
        kind: "credit",
      });
  }
  return result.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

/** A pending repayment has already reserved its source money. Forecast and
 * spendable need only the uncovered due amount, without marking any debt paid.
 * Undated and distant intentions retain that reservation until post/cancel. */
export function projectedDebtObligations(
  state: FinanceState,
  today: string,
  end: string,
): DebtObligation[] {
  const reserved = new Map<string, number>();
  for (const transaction of state.transactions) {
    if (
      transactionStatus(transaction) !== "pending" ||
      transaction.type !== "transfer" ||
      !transaction.toAccountId
    )
      continue;
    reserved.set(
      transaction.toAccountId,
      Math.min(
        MAX_MONEY,
        (reserved.get(transaction.toAccountId) ?? 0) +
          receivedAmount(transaction),
      ),
    );
  }
  return debtObligations(state, today, end)
    .map((obligation) =>
      obligation.kind === "credit"
        ? {
            ...obligation,
            amount: Math.max(
              0,
              obligation.amount - (reserved.get(obligation.id) ?? 0),
            ),
          }
        : obligation,
    )
    .filter((obligation) => obligation.amount > 0);
}

export function validateDebts(state: FinanceState, today = localDate()) {
  const debts = state.debts ?? [];
  if (
    debts.length > 200 ||
    new Set(debts.map((debt) => debt.id)).size !== debts.length
  )
    throw new Error(
      "Проверьте список долгов: допустимо до 200 уникальных записей.",
    );
  const byId = new Map(debts.map((debt) => [debt.id, debt]));
  const movements = new Map<string, Map<string, number>>();
  for (const debt of debts) {
    if (!debtSchema.safeParse(debt).success)
      throw new Error("Проверьте название, сумму, валюту и даты долга.");
    const account = state.accounts.find((entry) => entry.id === debt.accountId);
    if (
      !account ||
      account.kind !== "spending" ||
      accountCurrency(state, account.id) !== debt.currency
    )
      throw new Error("Для долга выберите повседневный счёт в его валюте.");
    if (debt.startsOn > today || (debt.dueDate && debt.dueDate < debt.startsOn))
      throw new Error(
        "Дата долга не может быть в будущем, а срок возврата — раньше начала долга.",
      );
    currencyRate(state, debt.currency);
  }
  for (const transaction of state.transactions) {
    if (!transaction.debtId && !transaction.debtAction) continue;
    if (!isPosted(transaction))
      throw new Error("Движения долга должны быть проведены.");
    const debt = transaction.debtId ? byId.get(transaction.debtId) : undefined;
    if (
      !debt ||
      (transaction.debtAction !== "issue" && transaction.debtAction !== "repay")
    )
      throw new Error("Операция ссылается на неизвестный долг.");
    if (
      transaction.type !== debtTransactionType(debt, transaction.debtAction) ||
      transaction.refundOf ||
      transaction.splits ||
      transaction.recurringId ||
      transaction.plannedIncomeId ||
      transaction.goalId
    )
      throw new Error(
        "Операция долга должна быть отдельной выдачей или возвратом основной суммы.",
      );
    const account = state.accounts.find(
      (entry) => entry.id === transaction.accountId,
    );
    if (
      !account ||
      account.kind !== "spending" ||
      accountCurrency(state, account.id) !== debt.currency
    )
      throw new Error("Валюта операции должна совпадать с валютой долга.");
    if (
      !validDate(transaction.date) ||
      transaction.date < debt.startsOn ||
      transaction.date > today
    )
      throw new Error(
        "Дата операции долга должна быть между началом долга и сегодняшним днём.",
      );
    if (
      !Number.isSafeInteger(transaction.amount) ||
      transaction.amount <= 0 ||
      transaction.amount > MAX_MONEY
    )
      throw new Error("Проверьте сумму операции долга.");
    const dates = movements.get(debt.id) ?? new Map<string, number>();
    dates.set(
      transaction.date,
      (dates.get(transaction.date) ?? 0) +
        (transaction.debtAction === "issue"
          ? transaction.amount
          : -transaction.amount),
    );
    movements.set(debt.id, dates);
  }
  for (const debt of debts) {
    let balance = debt.openingAmount;
    for (const [, amount] of [...(movements.get(debt.id) ?? [])].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      balance += amount;
      if (!Number.isSafeInteger(balance) || balance < 0 || balance > MAX_MONEY)
        throw new Error(
          "Возврат превышает долг на дату операции или сумма долга слишком велика.",
        );
    }
  }
}

export function validateCreditAccounts(
  state: FinanceState,
  today = localDate(),
) {
  const held = pendingHolds(state);
  for (const account of state.accounts) {
    if (account.kind !== "credit") {
      if (
        account.creditLimit !== undefined ||
        account.paymentDueAmount !== undefined ||
        account.paymentDueDate !== undefined ||
        account.paymentDueBaselineIds !== undefined ||
        account.creditTermsConfirmedOn !== undefined ||
        account.creditTermsReminderDate !== undefined
      )
        throw new Error(
          "Кредитные условия допустимы только для кредитной карты.",
        );
      continue;
    }
    if (
      !Number.isSafeInteger(account.creditLimit) ||
      (account.creditLimit ?? 0) <= 0 ||
      (account.creditLimit ?? 0) > MAX_MONEY
    )
      throw new Error("Укажите положительный кредитный лимит.");
    if (
      Math.max(
        0,
        -accountBalance(state, account.id, today) + (held.get(account.id) ?? 0),
      ) > account.creditLimit!
    )
      throw new Error("Задолженность по карте превышает кредитный лимит.");
    if (
      account.paymentDueAmount !== undefined &&
      (!Number.isSafeInteger(account.paymentDueAmount) ||
        account.paymentDueAmount < 0 ||
        account.paymentDueAmount > MAX_MONEY)
    )
      throw new Error("Проверьте сумму обязательного платежа по карте.");
    if (
      (account.paymentDueAmount ?? 0) > 0 &&
      (!account.paymentDueDate || !validDate(account.paymentDueDate))
    )
      throw new Error("Укажите дату обязательного платежа по карте.");
    if (account.paymentDueDate && !validDate(account.paymentDueDate))
      throw new Error("Проверьте дату платежа по карте.");
    if (
      account.creditTermsConfirmedOn !== undefined &&
      (!validDate(account.creditTermsConfirmedOn) ||
        account.creditTermsConfirmedOn > today)
    )
      throw new Error("Дата подтверждения выписки не может быть в будущем.");
    if (
      account.creditTermsReminderDate !== undefined &&
      !validDate(account.creditTermsReminderDate)
    )
      throw new Error("Проверьте дату напоминания об условиях карты.");
    if (
      account.paymentDueBaselineIds &&
      (account.paymentDueBaselineIds.length > 20_000 ||
        new Set(account.paymentDueBaselineIds).size !==
          account.paymentDueBaselineIds.length ||
        account.paymentDueBaselineIds.some(
          (value) => typeof value !== "string" || !value || value.length > 100,
        ))
    )
      throw new Error("Проверьте историю расчёта платежа по карте.");
  }
}
