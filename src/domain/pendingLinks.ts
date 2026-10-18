import { dateInMonth, monthKey, validDate } from "../shared/lib/dates";
import { paymentForMonth, resolvePaymentOccurrence } from "./payments";
import { resolveIncomeOccurrence } from "./incomes";
import { isScheduledDate } from "./recurrence";
import { transactionStatus } from "./transactionStatus";
import type { FinanceState, Transaction } from "./types";

/** New intentions must refer to a live, unskipped occurrence. Historical facts
 * retain the older link rules and are not reinterpreted when a plan changes. */
export function pendingLinkError(
  state: FinanceState,
  transaction: Transaction,
): string | null {
  if (transactionStatus(transaction) !== "pending") return null;
  if (transaction.recurringId) {
    const template = state.recurring.find(
      (entry) => entry.id === transaction.recurringId,
    );
    const date = transaction.occurrenceDate;
    const payment =
      template && date
        ? resolvePaymentOccurrence(
            template,
            date,
            transaction.recurringVersionId,
          )?.payment
        : undefined;
    if (
      !template ||
      transaction.type !== "expense" ||
      !date ||
      !validDate(date)
    )
      return "Неверная связь ожидающего платежа.";
    if (!payment)
      return "Дата или версия ожидания не соответствует обязательству платежа.";
    if (
      template?.versions?.find(
        (v) => v.id === (transaction.recurringVersionId ?? "legacy"),
      )?.inactiveLegacy
    )
      return "Этот прежний выключенный план не создаёт обязательств.";
    if (!template?.versions && !payment.active)
      return "Сначала включите платёж, чтобы сохранить ожидание.";
    if (
      (payment.startsOn && date < payment.startsOn) ||
      (payment.schedule
        ? !isScheduledDate(payment.schedule, date)
        : date !== dateInMonth(date, paymentForMonth(payment, date).day))
    )
      return "Дата ожидания не соответствует обязательству платежа.";
    if (
      payment.schedule
        ? payment.skippedDates?.includes(date)
        : payment.skippedMonths?.includes(monthKey(date))
    )
      return "Сначала верните пропущенный платёж в план, затем создайте ожидание.";
  }
  if (transaction.plannedIncomeId) {
    const template = state.plannedIncomes?.find(
      (entry) => entry.id === transaction.plannedIncomeId,
    );
    const date = transaction.incomeOccurrenceDate;
    const occurrence =
      template && date
        ? resolveIncomeOccurrence(template, date, transaction.incomeVersionId)
        : undefined;
    const plan = occurrence?.plan;
    if (
      !plan ||
      occurrence?.cancelled ||
      transaction.type !== "income" ||
      !date ||
      !validDate(date) ||
      date < plan.date ||
      (plan.repeat === "once"
        ? date !== plan.date
        : plan.schedule
          ? !isScheduledDate(plan.schedule, date)
          : date !== dateInMonth(date, Number(plan.date.slice(-2))))
    )
      return "Дата ожидания не соответствует планируемому поступлению.";
  }
  return null;
}
