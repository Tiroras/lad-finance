import {
  changedPaymentHistory,
  dateInMonth,
  localDate,
  monthKey,
  paymentForMonth,
  uid,
  validDate,
} from "../finance";
import type { FinanceState, Recurring } from "../types";
import { saveTransaction } from "./transactions";
import { checkAmount, checkDay, checkName, ensure } from "./validation";

export type RecurringInput = Pick<
  Recurring,
  | "name"
  | "amount"
  | "day"
  | "kind"
  | "category"
  | "accountId"
  | "startsOn"
  | "skippedMonths"
> & { id?: string };
export function saveRecurring(
  state: FinanceState,
  input: RecurringInput,
  today = localDate(),
): FinanceState {
  const original = state.recurring.find((p) => p.id === input.id);
  ensure(!input.id || original, "Платёж уже удалён.");
  ensure(
    original || state.recurring.length < 200,
    "Можно создать не более 200 платежей.",
  );
  checkName(input.name);
  checkAmount(input.amount);
  checkDay(input.day);
  ensure(
    input.startsOn &&
      validDate(input.startsOn) &&
      input.startsOn >= "2000-01-01" &&
      input.startsOn <= "2100-12-31",
    "Укажите дату начала учёта от 2000 до 2100 года: ГГГГ-ММ-ДД.",
  );
  ensure(
    state.accounts.some(
      (a) => a.id === input.accountId && a.kind === "spending",
    ),
    "Выберите повседневный счёт.",
  );
  ensure(
    state.categories.some((c) => c.id === input.category),
    "Выберите категорию.",
  );
  const payment: Recurring = {
    ...input,
    id: original?.id ?? uid(),
    name: input.name.trim(),
    active: original?.active ?? true,
    history: changedPaymentHistory(original, input.amount, input.day, today),
    icon:
      original?.icon ??
      (input.kind === "bill" ? "home-outline" : "musical-notes-outline"),
    color: original?.color ?? "#EEEBF5",
  };
  return {
    ...state,
    recurring: original
      ? state.recurring.map((p) => (p.id === payment.id ? payment : p))
      : [...state.recurring, payment],
  };
}

export function deleteRecurring(state: FinanceState, id: string): FinanceState {
  return {
    ...state,
    recurring: state.recurring.filter((p) => p.id !== id),
    transactions: state.transactions.map((t) =>
      t.recurringId === id
        ? { ...t, recurringId: undefined, occurrenceDate: undefined }
        : t,
    ),
  };
}

export function setRecurringActive(
  state: FinanceState,
  id: string,
  active: boolean,
  today = localDate(),
): FinanceState {
  ensure(
    state.recurring.some((p) => p.id === id),
    "Платёж уже удалён.",
  );
  return {
    ...state,
    recurring: state.recurring.map((p) =>
      p.id === id
        ? { ...p, active, startsOn: active && !p.active ? today : p.startsOn }
        : p,
    ),
  };
}

function occurrence(
  state: FinanceState,
  id: string,
  date: string,
  today: string,
) {
  const template = state.recurring.find((p) => p.id === id);
  ensure(template && template.active, "Платёж удалён или исключён из плана.");
  ensure(validDate(date), "Некорректная дата платежа.");
  const payment = paymentForMonth(template, date);
  ensure(
    date >= (payment.startsOn ?? `${monthKey(today)}-01`) &&
      date === dateInMonth(date, payment.day),
    "Дата не соответствует плану платежа. Откройте его заново.",
  );
  return payment;
}

export function setPaymentSkipped(
  state: FinanceState,
  id: string,
  date: string,
  skipped: boolean,
  today = localDate(),
): FinanceState {
  occurrence(state, id, date, today);
  ensure(
    !state.transactions.some(
      (t) =>
        t.recurringId === id &&
        t.occurrenceDate?.slice(0, 7) === monthKey(date),
    ),
    "Оплаченный месяц нельзя пропустить.",
  );
  return {
    ...state,
    recurring: state.recurring.map((p) =>
      p.id === id
        ? {
            ...p,
            skippedMonths: skipped
              ? [...new Set([...(p.skippedMonths ?? []), monthKey(date)])]
              : (p.skippedMonths ?? []).filter((m) => m !== monthKey(date)),
          }
        : p,
    ),
  };
}

export function payRecurring(
  state: FinanceState,
  id: string,
  date: string,
  today = localDate(),
  transactionId?: string,
): FinanceState {
  const payment = occurrence(state, id, date, today);
  if (
    state.transactions.some(
      (t) =>
        t.recurringId === id &&
        t.occurrenceDate?.slice(0, 7) === monthKey(date),
    )
  )
    return state;
  ensure(
    !payment.skippedMonths?.includes(monthKey(date)),
    "Сначала верните этот месяц в план.",
  );
  if (transactionId) {
    const transaction = state.transactions.find((t) => t.id === transactionId);
    ensure(
      transaction &&
        transaction.type === "expense" &&
        !transaction.recurringId &&
        transaction.amount === payment.amount &&
        transaction.accountId === payment.accountId &&
        transaction.date >= `${monthKey(date)}-01` &&
        transaction.date <= today,
      "Расход больше не подходит для этого платежа.",
    );
    return saveTransaction(
      state,
      { ...transaction, recurringId: id, occurrenceDate: date },
      today,
    );
  }
  return saveTransaction(
    state,
    {
      type: "expense",
      title: payment.name,
      amount: payment.amount,
      date: today,
      category: payment.category,
      accountId: payment.accountId,
      recurringId: id,
      occurrenceDate: date,
    },
    today,
  );
}
