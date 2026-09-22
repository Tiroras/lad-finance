import {
  dateInMonth,
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
} from "../shared/lib/dates";
import type { FinanceState, Occurrence, Recurring, Transaction } from "./types";
import { iterateScheduleDates, scheduleDates } from "./recurrence";

export const paymentOccurrenceKey = (payment: Recurring, date: string) =>
  payment.schedule ? date : monthKey(date);

export function canLinkPayment(
  transaction: Transaction,
  payment: Recurring,
  date: string,
  today: string,
) {
  return (
    transaction.type === "expense" &&
    !transaction.recurringId &&
    !transaction.debtId &&
    transaction.amount === payment.amount &&
    transaction.accountId === payment.accountId &&
    transaction.date >= `${monthKey(date)}-01` &&
    transaction.date <= today
  );
}

export function annualPreparation(
  state: FinanceState,
  payment: Recurring,
  today = localDate(),
) {
  if (!payment.active || payment.schedule?.unit !== "year") return undefined;
  const paid = new Set(
    state.transactions
      .filter((t) => t.recurringId === payment.id && t.date <= today)
      .map((t) => t.occurrenceDate),
  );
  const date = scheduleDates(payment.schedule, today, "2101-01-01").find(
    (value) =>
      value >= (payment.startsOn ?? today) &&
      !paid.has(value) &&
      !payment.skippedDates?.includes(value),
  );
  if (!date) return undefined;
  const months = Math.max(
    1,
    (Number(date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) -
      Number(today.slice(5, 7)) +
      (date > dateInMonth(date, Number(today.slice(-2))) ? 1 : 0),
  );
  return {
    date,
    months,
    monthly: Math.ceil(payment.amount / months),
    amount: payment.amount,
  };
}

export function upcoming(
  state: FinanceState,
  start = localDate(),
  end = shiftDate(start, 31),
): Occurrence[] {
  return paymentOccurrences(state, start, end, start);
}

export const MAX_PAYMENT_OCCURRENCES = 20_000;
const capacityError = () =>
  new Error(
    "Слишком много обязательств: допустимо до 20 000 неоплаченных просрочек и дат ближайшего года. Уточните дату начала, интервал или отметьте завершённые платежи.",
  );

function visitPaymentOccurrences(
  state: FinanceState,
  start: string,
  end: string,
  today: string,
  visit: (occurrence: Occurrence) => void,
) {
  const templates = new Map(
    state.recurring.filter((p) => p.active).map((p) => [p.id, p]),
  );
  const paid = new Set<string>();
  for (const transaction of state.transactions) {
    const payment = transaction.recurringId
      ? templates.get(transaction.recurringId)
      : undefined;
    if (
      payment &&
      transaction.type === "expense" &&
      transaction.occurrenceDate &&
      transaction.date <= today
    )
      paid.add(
        `${payment.id}:${paymentOccurrenceKey(payment, transaction.occurrenceDate)}`,
      );
  }
  for (const template of templates.values()) {
    const skipped = new Set(
      template.schedule ? template.skippedDates : template.skippedMonths,
    );
    const add = (payment: Recurring, date: string) => {
      if (date < start || date >= end || date < (template.startsOn ?? today))
        return;
      const key = paymentOccurrenceKey(payment, date);
      visit({
        payment,
        date,
        paid: paid.has(`${payment.id}:${key}`),
        skipped: skipped.has(key),
      });
    };
    if (template.schedule) {
      for (const date of iterateScheduleDates(template.schedule, start, end))
        add(paymentForMonth(template, date), date);
    } else {
      for (
        let month = `${monthKey(start)}-01`;
        month < end;
        month = shiftMonth(month, 1)
      ) {
        const payment = paymentForMonth(template, month);
        add(payment, dateInMonth(month, payment.day));
      }
    }
  }
}

function paymentOccurrences(
  state: FinanceState,
  start: string,
  end: string,
  today: string,
  pendingOnly = false,
): Occurrence[] {
  const result: Occurrence[] = [];
  visitPaymentOccurrences(state, start, end, today, (occurrence) => {
    if (pendingOnly && (occurrence.paid || occurrence.skipped)) return;
    if (result.length >= MAX_PAYMENT_OCCURRENCES) throw capacityError();
    result.push(occurrence);
  });
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function firstPaymentDate(state: FinanceState, today: string) {
  return state.recurring
    .filter((p) => p.active)
    .reduce(
      (first, p) => (p.startsOn && p.startsOn < first ? p.startsOn : first),
      today,
    );
}

// Count before allocating calendar events. Paid/skipped history is not a debt;
// future dates also cover the 365-day subscription summary and give headroom.
export function validatePaymentCapacity(state: FinanceState, today: string) {
  let count = 0;
  visitPaymentOccurrences(
    state,
    firstPaymentDate(state, today),
    shiftDate(today, 365),
    today,
    (occurrence) => {
      if (occurrence.date < today && (occurrence.paid || occurrence.skipped))
        return;
      if (++count > MAX_PAYMENT_OCCURRENCES) throw capacityError();
    },
  );
}

export function paymentForMonth(payment: Recurring, date: string): Recurring {
  if (payment.schedule) {
    const rule = payment.amountHistory?.find((item) => date <= item.until);
    return rule ? { ...payment, amount: rule.amount } : payment;
  }
  const rule = payment.history
    ?.slice()
    .sort((a, b) => a.untilMonth.localeCompare(b.untilMonth))
    .find((item) => monthKey(date) <= item.untilMonth);
  return rule ? { ...payment, day: rule.day, amount: rule.amount } : payment;
}

export function changedPaymentHistory(
  original: Recurring | undefined,
  amount: number,
  day: number,
  today = localDate(),
) {
  if (!original || (original.amount === amount && original.day === day))
    return original?.history;
  const untilMonth = monthKey(shiftMonth(today, -1));
  const history = original.history ?? [];
  if (history.some((rule) => rule.untilMonth >= untilMonth)) return history;
  return [
    ...history,
    { untilMonth, day: original.day, amount: original.amount },
  ];
}

export function overduePayments(state: FinanceState, today = localDate()) {
  return paymentOccurrences(
    state,
    firstPaymentDate(state, today),
    today,
    today,
    true,
  );
}
