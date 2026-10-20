import {
  dateInMonth,
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import type {
  FinanceState,
  Occurrence,
  PaymentTermsVersion,
  Recurring,
  Transaction,
} from "./types";
import { isScheduledDate, iterateScheduleDates } from "./recurrence";
import { isPosted, transactionStatus } from "./transactionStatus";

export function legacyPaymentTerms(
  payment: Recurring,
  fallbackStart = "2000-01-01",
): PaymentTermsVersion {
  return {
    id: "legacy",
    legacy: true,
    effectiveFrom: payment.startsOn ?? fallbackStart,
    amount: payment.amount,
    day: payment.day,
    accountId: payment.accountId,
    category: payment.category,
    schedule: payment.schedule,
    history: payment.history,
    amountHistory: payment.amountHistory,
    skippedMonths: payment.skippedMonths,
    skippedDates: payment.skippedDates,
  };
}

/** Reading old ledgers never materializes versions or revives disabled plans. */
export function paymentVersions(payment: Recurring, fallbackStart?: string) {
  return (
    payment.versions ??
    (payment.active ? [legacyPaymentTerms(payment, fallbackStart)] : [])
  );
}

function snapshot(
  payment: Recurring,
  version: PaymentTermsVersion,
  date: string,
): Recurring {
  const resolved: Recurring = {
    ...payment,
    amount: version.amount,
    day: version.day,
    accountId: version.accountId,
    category: version.category,
    schedule: version.schedule,
    startsOn: version.effectiveFrom,
    history: version.history,
    amountHistory: version.amountHistory,
    skippedMonths: version.skippedMonths,
    skippedDates: version.skippedDates,
  };
  if (version.schedule) {
    const rule = version.amountHistory?.find((item) => date <= item.until);
    return rule ? { ...resolved, amount: rule.amount } : resolved;
  }
  const rule = version.history
    ?.slice()
    .sort((a, b) => a.untilMonth.localeCompare(b.untilMonth))
    .find((item) => monthKey(date) <= item.untilMonth);
  return rule ? { ...resolved, day: rule.day, amount: rule.amount } : resolved;
}

export function resolvePaymentOccurrence(
  payment: Recurring,
  date: string,
  versionId = "legacy",
): { payment: Recurring; date: string; versionId: string } | undefined {
  if (!validDate(date)) return undefined;
  const version = payment.versions
    ? payment.versions.find((item) => item.id === versionId)
    : versionId === "legacy"
      ? legacyPaymentTerms(payment)
      : undefined;
  if (
    !version ||
    version.voided ||
    date < version.effectiveFrom ||
    (version.effectiveTo && date >= version.effectiveTo)
  )
    return undefined;
  const resolved = snapshot(payment, version, date);
  if (
    resolved.schedule
      ? !isScheduledDate(resolved.schedule, date)
      : date !== dateInMonth(date, resolved.day)
  )
    return undefined;
  return { payment: resolved, date, versionId };
}

export const paymentOccurrenceKey = (
  payment: Recurring,
  date: string,
  versionId = "legacy",
) => {
  const version = payment.versions?.find((item) => item.id === versionId);
  const schedule = version ? version.schedule : payment.schedule;
  return `${versionId}:${schedule ? date : monthKey(date)}`;
};

export function canLinkPayment(
  transaction: Transaction,
  payment: Recurring,
  _date: string,
  today: string,
) {
  return (
    transaction.type === "expense" &&
    isPosted(transaction) &&
    !transaction.recurringId &&
    !transaction.plannedIncomeId &&
    !transaction.debtId &&
    !transaction.refundOf &&
    transaction.amount === payment.amount &&
    transaction.accountId === payment.accountId &&
    transaction.date <= today
  );
}

export function annualPreparation(
  state: FinanceState,
  payment: Recurring,
  today = localDate(),
) {
  if (
    !paymentVersions(payment, today).some(
      (version) =>
        version.schedule?.unit === "year" &&
        !version.inactiveLegacy &&
        !version.voided,
    )
  )
    return undefined;
  const annual = payment.versions
    ? {
        ...payment,
        versions: payment.versions.filter(
          (version) => version.schedule?.unit === "year",
        ),
      }
    : payment;
  const next = upcoming(
    { ...state, recurring: [annual] },
    today,
    "2101-01-01",
  ).find(
    (item) =>
      item.payment.schedule?.unit === "year" && !item.paid && !item.skipped,
  );
  if (!next) return undefined;
  const { date, payment: terms } = next;
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
    monthly: Math.ceil(terms.amount / months),
    amount: terms.amount,
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
    state.recurring.map((payment) => [payment.id, payment]),
  );
  const paid = new Set<string>();
  for (const transaction of state.transactions) {
    const payment = transaction.recurringId
      ? templates.get(transaction.recurringId)
      : undefined;
    if (
      payment &&
      transaction.type === "expense" &&
      isPosted(transaction) &&
      transaction.occurrenceDate &&
      transaction.date <= today
    )
      paid.add(
        `${payment.id}:${paymentOccurrenceKey(payment, transaction.occurrenceDate, transaction.recurringVersionId)}`,
      );
  }
  for (const template of templates.values()) {
    for (const version of paymentVersions(template, today)) {
      if (version.inactiveLegacy || version.voided) continue;
      const begin =
        start > version.effectiveFrom ? start : version.effectiveFrom;
      const until =
        version.effectiveTo && version.effectiveTo < end
          ? version.effectiveTo
          : end;
      if (begin >= until) continue;
      const skipped = new Set(
        version.schedule ? version.skippedDates : version.skippedMonths,
      );
      const add = (date: string) => {
        if (date < begin || date >= until) return;
        const occurrence = resolvePaymentOccurrence(template, date, version.id);
        if (!occurrence) return;
        const key = paymentOccurrenceKey(template, date, version.id);
        visit({
          ...occurrence,
          paid: paid.has(`${template.id}:${key}`),
          skipped: skipped.has(version.schedule ? date : monthKey(date)),
        });
      };
      if (version.schedule) {
        for (const date of iterateScheduleDates(version.schedule, begin, until))
          add(date);
      } else {
        for (
          let month = `${monthKey(begin)}-01`;
          month < until;
          month = shiftMonth(month, 1)
        )
          add(dateInMonth(month, snapshot(template, version, month).day));
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
    .flatMap((payment) => paymentVersions(payment, today))
    .filter((version) => !version.inactiveLegacy && !version.voided)
    .reduce(
      (first, version) =>
        version.effectiveFrom < first ? version.effectiveFrom : first,
      today,
    );
}

export function paymentCapacityCount(state: FinanceState, today: string) {
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
  return count;
}

export function validatePaymentCapacity(state: FinanceState, today: string) {
  paymentCapacityCount(state, today);
}

/** Compatibility accessor. Event operations must use resolvePaymentOccurrence. */
export function paymentForMonth(payment: Recurring, date: string): Recurring {
  const version = payment.versions?.find(
    (item) =>
      !item.voided &&
      date >= item.effectiveFrom &&
      (!item.effectiveTo || date < item.effectiveTo),
  );
  return snapshot(payment, version ?? legacyPaymentTerms(payment), date);
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

export function paymentPending(
  state: FinanceState,
  payment: Recurring,
  date: string,
  versionId?: string,
) {
  return state.transactions.find(
    (transaction) =>
      transactionStatus(transaction) === "pending" &&
      transaction.recurringId === payment.id &&
      transaction.occurrenceDate &&
      paymentOccurrenceKey(
        payment,
        transaction.occurrenceDate,
        transaction.recurringVersionId,
      ) === paymentOccurrenceKey(payment, date, versionId),
  );
}

/** Explicitly skipped history remains reachable after leaving the calendar. */
export function skippedPaymentOccurrences(payment: Recurring) {
  const result: { payment: Recurring; date: string; versionId: string }[] = [];
  for (const version of paymentVersions(payment)) {
    if (version.voided || version.inactiveLegacy) continue;
    const dates = version.schedule
      ? (version.skippedDates ?? [])
      : (version.skippedMonths ?? []).map((month) => {
          const date = `${month}-01`;
          return dateInMonth(date, snapshot(payment, version, date).day);
        });
    for (const date of dates) {
      const occurrence = resolvePaymentOccurrence(payment, date, version.id);
      if (occurrence) result.push(occurrence);
    }
  }
  return result.sort((first, second) => second.date.localeCompare(first.date));
}
