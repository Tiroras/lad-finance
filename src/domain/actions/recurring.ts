import { accountCurrency } from "../currency";
import {
  changedPaymentHistory,
  dateInMonth,
  localDate,
  monthKey,
  paymentForMonth,
  uid,
  validDate,
  shiftDate,
} from "../finance";
import { canLinkPayment, paymentOccurrenceKey } from "../payments";
import {
  isScheduledDate,
  scheduleSchema,
  validateSchedules,
} from "../recurrence";
import type { FinanceState, Recurring } from "../types";
import { saveTransaction } from "./transactions";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkDay,
  checkName,
  ensure,
} from "./validation";

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
  | "schedule"
  | "skippedDates"
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
  ensure(
    !original ||
      accountCurrency(state, original.accountId) ===
        accountCurrency(state, input.accountId),
    "Для смены валюты создайте новый план. Валюта существующего плана сохраняется для истории и сценариев.",
  );
  checkName(input.name);
  checkAmount(input.amount);
  checkDay(input.day);
  ensure(
    !input.schedule || scheduleSchema.safeParse(input.schedule).success,
    "Укажите корректный интервал повторения от 1 до 365 и дату начала.",
  );
  const sameSchedule =
    JSON.stringify(original?.schedule) === JSON.stringify(input.schedule);
  ensure(
    !original || sameSchedule,
    "График существующего платежа сохраняется для истории. Создайте новый платёж для другой периодичности.",
  );
  ensure(
    !original?.schedule || original.startsOn === input.startsOn,
    "Для другой даты начала создайте новый платёж: старые обязательства должны сохраниться.",
  );
  ensure(
    original ||
      !input.schedule ||
      (input.schedule.anchor >= (input.startsOn ?? "") &&
        input.schedule.anchor >= shiftDate(today, -366)),
    "Первое повторение должно быть не раньше даты начала учёта и не старше года.",
  );
  ensure(
    input.startsOn &&
      validDate(input.startsOn) &&
      input.startsOn >= "2000-01-01" &&
      input.startsOn <= "2100-12-31",
    "Укажите корректную дату начала учёта от 2000 до 2100 года.",
  );
  ensure(
    state.accounts.some(
      (a) => a.id === input.accountId && a.kind === "spending",
    ),
    "Выберите повседневный счёт.",
  );
  ensure(
    state.categories.some(
      (c) =>
        c.id === input.category && (!c.archived || original?.category === c.id),
    ),
    "Выберите активную категорию.",
  );
  const payment: Recurring = {
    ...input,
    id: original?.id ?? uid(),
    name: input.name.trim(),
    active: original?.active ?? true,
    history: input.schedule
      ? original?.history
      : changedPaymentHistory(original, input.amount, input.day, today),
    amountHistory:
      input.schedule && original && original.amount !== input.amount
        ? [
            ...(original.amountHistory ?? []),
            ...(original.amountHistory?.some(
              (rule) => rule.until >= shiftDate(today, -1),
            )
              ? []
              : [{ until: shiftDate(today, -1), amount: original.amount }]),
          ]
        : original?.amountHistory,
    icon:
      original?.icon ??
      (input.kind === "bill" ? "home-outline" : "musical-notes-outline"),
    color: original?.color ?? "#EEEBF5",
  };
  const next: FinanceState = {
    ...state,
    recurring: original
      ? state.recurring.map((p) => (p.id === payment.id ? payment : p))
      : [...state.recurring, payment],
  };

  validateSchedules(next);
  checkCurrencyAmounts(next, today);
  return next;
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
  const next: FinanceState = {
    ...state,
    recurring: state.recurring.map((p) =>
      p.id === id
        ? { ...p, active, startsOn: active && !p.active ? today : p.startsOn }
        : p,
    ),
  };
  checkCurrencyAmounts(next, today);
  return next;
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
      (payment.schedule
        ? isScheduledDate(payment.schedule, date)
        : date === dateInMonth(date, payment.day)),
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
  const payment = occurrence(state, id, date, today);
  ensure(
    !state.transactions.some(
      (t) =>
        t.recurringId === id &&
        t.occurrenceDate &&
        paymentOccurrenceKey(payment, t.occurrenceDate) ===
          paymentOccurrenceKey(payment, date),
    ),
    "Оплаченный платёж нельзя пропустить.",
  );
  const next: FinanceState = {
    ...state,
    recurring: state.recurring.map((p) =>
      p.id === id
        ? {
            ...p,
            ...(p.schedule
              ? {
                  skippedDates: skipped
                    ? [...new Set([...(p.skippedDates ?? []), date])]
                    : (p.skippedDates ?? []).filter((d) => d !== date),
                }
              : {
                  skippedMonths: skipped
                    ? [...new Set([...(p.skippedMonths ?? []), monthKey(date)])]
                    : (p.skippedMonths ?? []).filter(
                        (m) => m !== monthKey(date),
                      ),
                }),
          }
        : p,
    ),
  };
  checkCurrencyAmounts(next, today);
  return next;
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
        t.occurrenceDate &&
        paymentOccurrenceKey(payment, t.occurrenceDate) ===
          paymentOccurrenceKey(payment, date),
    )
  )
    return state;
  ensure(
    !(payment.schedule
      ? payment.skippedDates?.includes(date)
      : payment.skippedMonths?.includes(monthKey(date))),
    "Сначала верните этот платёж в план.",
  );
  if (transactionId) {
    const transaction = state.transactions.find((t) => t.id === transactionId);
    ensure(
      transaction && canLinkPayment(transaction, payment, date, today),
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
