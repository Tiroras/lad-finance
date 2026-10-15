import { dateInMonth, monthKey, validDate } from "../shared/lib/dates";
import { paymentForMonth } from "./payments";
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
    const payment = state.recurring.find(
      (entry) => entry.id === transaction.recurringId,
    );
    const date = transaction.occurrenceDate;
    if (!payment || transaction.type !== "expense" || !date || !validDate(date))
      return "Неверная связь ожидающего платежа.";
    if (!payment.active)
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
    const plan = state.plannedIncomes?.find(
      (entry) => entry.id === transaction.plannedIncomeId,
    );
    const date = transaction.incomeOccurrenceDate;
    if (
      !plan ||
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
