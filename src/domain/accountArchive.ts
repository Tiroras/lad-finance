import { overduePayments, upcoming, paymentVersions } from "./payments";
import { shiftDate } from "../shared/lib/dates";
import { accountBalance } from "./accountBalances";
import {
  creditOutstanding,
  creditPaymentRemaining,
  debtBalance,
} from "./debts";
import { incomeReceived, incomeAccountObligation } from "./incomes";
import { transactionStatus } from "./transactionStatus";
import type { FinanceState } from "./types";

export const activeAccounts = (state: FinanceState) =>
  state.accounts.filter((account) => !account.archived);
export interface AccountArchiveBlocker {
  code:
    | "balance"
    | "pending"
    | "payment"
    | "income"
    | "debt"
    | "credit"
    | "forecast";
  message: string;
  entityId?: string;
}
export function accountArchiveBlockers(
  state: FinanceState,
  accountId: string,
  today: string,
): readonly AccountArchiveBlocker[] {
  const account = state.accounts.find((entry) => entry.id === accountId);
  if (!account) throw new Error("Счёт уже удалён.");
  const blockers: AccountArchiveBlocker[] = [];
  const preferences = state.settings.forecast;
  if (
    preferences?.dailyAccountId === accountId ||
    preferences?.goalAccounts?.some(
      (entry) =>
        entry.fromAccountId === accountId || entry.toAccountId === accountId,
    ) ||
    preferences?.repaymentAccounts?.some(
      (entry) =>
        entry.accountId === accountId ||
        (entry.kind === "credit" && entry.sourceId === accountId),
    ) ||
    preferences?.transfers?.some(
      (entry) =>
        entry.accountId === accountId || entry.toAccountId === accountId,
    )
  )
    blockers.push({
      code: "forecast",
      message:
        "Сначала замените или уберите счёт из назначений и переводов в настройках прогноза.",
    });
  if (accountBalance(state, accountId, today) !== 0)
    blockers.push({
      code: "balance",
      message: "Для архива фактический остаток счёта должен быть нулевым.",
    });
  for (const transaction of state.transactions)
    if (
      transactionStatus(transaction) === "pending" &&
      (transaction.accountId === accountId ||
        transaction.toAccountId === accountId)
    )
      blockers.push({
        code: "pending",
        entityId: transaction.id,
        message: `Проведите или отмените ожидание «${transaction.title}».`,
      });
  for (const payment of state.recurring)
    if (
      payment.versions
        ? paymentVersions(payment).some(
            (v) =>
              v.accountId === accountId &&
              !v.inactiveLegacy &&
              !v.voided &&
              (!v.effectiveTo || v.effectiveTo > shiftDate(today, 1)),
          ) ||
          [
            ...overduePayments({ ...state, recurring: [payment] }, today),
            ...upcoming(
              { ...state, recurring: [payment] },
              today,
              shiftDate(today, 1),
            ),
          ].some(
            (o) => o.payment.accountId === accountId && !o.paid && !o.skipped,
          )
        : payment.accountId === accountId && payment.active
    )
      blockers.push({
        code: "payment",
        entityId: payment.id,
        message: `Завершите обязательства или перенесите платёж «${payment.name}».`,
      });
  for (const income of state.plannedIncomes ?? [])
    if (
      income.versions
        ? incomeAccountObligation(state, income, accountId, today)
        : income.accountId === accountId &&
          (income.repeat !== "once" ||
            !incomeReceived(state, income, income.date, today))
    )
      blockers.push({
        code: "income",
        entityId: income.id,
        message: `Завершите или перенесите план дохода «${income.name}».`,
      });
  for (const debt of state.debts ?? [])
    if (debt.accountId === accountId && debtBalance(state, debt, today) > 0)
      blockers.push({
        code: "debt",
        entityId: debt.id,
        message: `Завершите или перенесите долг «${debt.name}».`,
      });
  if (
    account.kind === "credit" &&
    (creditOutstanding(state, account, today) > 0 ||
      creditPaymentRemaining(state, account, today) > 0)
  )
    blockers.push({
      code: "credit",
      entityId: account.id,
      message: "Погасите обязательства кредитной карты.",
    });
  return blockers;
}

export function validateAccountArchives(state: FinanceState, today: string) {
  for (const account of state.accounts) {
    if (!account.archived) continue;
    const blocker = accountArchiveBlockers(state, account.id, today)[0];
    if (blocker)
      throw new Error(`Архивный счёт «${account.name}»: ${blocker.message}`);
  }
}
