import { accountAvailability } from "../accountBalances";
import { validateAccountArchives } from "../accountArchive";
import { accountCurrency, accountToBase } from "../currency";
import { validateCreditAccounts, validateDebts } from "../debts";
import { uid, validateTransaction } from "../finance";
import { goalSaved } from "../goals";
import {
  annualFundStartDate,
  fundPaymentAlreadyRecorded,
  goalFundCycleForPayment,
  validateGoalFunds,
} from "../goalFunds";
import { resolvePaymentOccurrence } from "../payments";
import { validateTransactionAmountsState } from "../transactionAmounts";
import type { FinanceState, GoalFundCycle, Transaction } from "../types";
import { validDate } from "../../shared/lib/dates";
import { saveGoal } from "./goals";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkSavings,
  ensure,
} from "./validation";

export interface AnnualFundInput {
  recurringId: string;
  occurrenceDate: string;
  recurringVersionId?: string;
  goalId?: string;
  name?: string;
  monthly?: number;
}

export function createAnnualFund(
  state: FinanceState,
  input: AnnualFundInput,
  today: string,
): FinanceState {
  const template = state.recurring.find(
    (entry) => entry.id === input.recurringId,
  );
  const occurrence =
    template &&
    resolvePaymentOccurrence(
      template,
      input.occurrenceDate,
      input.recurringVersionId,
    );
  ensure(
    occurrence && occurrence.payment.schedule?.unit === "year",
    "Выберите существующее обязательство годового платежа.",
  );
  ensure(
    validDate(input.occurrenceDate) && input.occurrenceDate >= today,
    "Для подготовки фонда выберите сегодняшний или будущий годовой платёж.",
  );
  ensure(
    !(occurrence.payment.skippedDates ?? []).includes(input.occurrenceDate),
    "Сначала верните годовой платёж в план.",
  );
  ensure(
    !goalFundCycleForPayment(
      state,
      template!.id,
      input.occurrenceDate,
      occurrence.versionId,
    ),
    "Для этого обязательства уже есть фонд.",
  );
  ensure(
    (state.goalFundCycles?.length ?? 0) < 500,
    "В учёте уже 500 циклов годовых фондов.",
  );
  const previous = state.goals.find((entry) => entry.id === input.goalId);
  ensure(!input.goalId || previous, "Цель уже удалена.");
  ensure(
    !previous ||
      !(state.goalFundCycles ?? []).some(
        (entry) => entry.goalId === previous.id && entry.status === "active",
      ),
    "У выбранной цели уже есть активный фонд.",
  );
  const currency = accountCurrency(state, occurrence.payment.accountId);
  ensure(
    !previous || (previous.currency ?? "RUB") === currency,
    "Валюты цели и годового платежа должны совпадать.",
  );
  ensure(
    state.accounts.some(
      (entry) =>
        entry.id === occurrence.payment.accountId &&
        entry.kind === "spending" &&
        !entry.archived,
    ),
    "Для годового фонда выберите активный повседневный счёт платежа.",
  );
  const months = Math.max(
    1,
    (Number(input.occurrenceDate.slice(0, 4)) - Number(today.slice(0, 4))) *
      12 +
      Number(input.occurrenceDate.slice(5, 7)) -
      Number(today.slice(5, 7)),
  );
  const monthly =
    input.monthly ??
    Math.ceil(
      Math.max(
        0,
        occurrence.payment.amount -
          (previous ? goalSaved(state, previous, today) : 0),
      ) / months,
    );
  checkAmount(monthly, true);
  const effectiveFrom = annualFundStartDate(state, previous, today);
  ensure(
    input.occurrenceDate === today || input.occurrenceDate >= effectiveFrom,
    previous && !previous.versions
      ? "График прежней цели меняется с начала следующего месяца. Для более раннего платежа создайте новую цель фонда."
      : `Новый график фонда может начаться с ${effectiveFrom}, после уже отмеченных взносов. Для более раннего платежа создайте новую цель фонда.`,
  );
  const nextGoalState = saveGoal(
    state,
    {
      id: previous?.id,
      name:
        input.name ??
        previous?.name ??
        `Фонд: ${occurrence.payment.name}`.slice(0, 120),
      target: occurrence.payment.amount,
      monthly: input.occurrenceDate === today ? 0 : monthly,
      icon: previous?.icon ?? "shield-checkmark-outline",
      currency,
      ...(input.occurrenceDate > today
        ? {
            day: state.settings.forecast?.goalDay ?? 31,
            effectiveFrom,
            deadline: input.occurrenceDate,
          }
        : {}),
    },
    today,
  );
  const goal = previous
    ? nextGoalState.goals.find((entry) => entry.id === previous.id)!
    : nextGoalState.goals.at(-1)!;
  const cycle: GoalFundCycle = {
    id: uid(),
    goalId: goal.id,
    recurringId: template!.id,
    recurringVersionId: occurrence.versionId,
    occurrenceDate: input.occurrenceDate,
    status: "active",
    createdOn: today,
  };
  ensure(
    !fundPaymentAlreadyRecorded(state, cycle),
    "У платежа уже есть оплата или ожидание. Сначала завершите его отдельно.",
  );
  const next: FinanceState = {
    ...nextGoalState,
    version: 7,
    goalFundCycles: [...(state.goalFundCycles ?? []), cycle],
  };
  checkSavings(next, today);
  validateGoalFunds(next, today);
  return next;
}

export function cancelAnnualFund(
  state: FinanceState,
  cycleId: string,
  today: string,
): FinanceState {
  const cycle = state.goalFundCycles?.find((entry) => entry.id === cycleId);
  ensure(
    cycle?.status === "active",
    "Связь этого фонда уже завершена или отменена.",
  );
  const next: FinanceState = {
    ...state,
    version: 7,
    goalFundCycles: state.goalFundCycles!.map((entry) =>
      entry.id === cycleId ? { ...entry, status: "cancelled" } : entry,
    ),
  };
  validateGoalFunds(next, today);
  return next;
}

export interface FundedPaymentInput {
  cycleId: string;
  savingsAccountId?: string;
  releaseAmount?: number;
}

/** Release, return transfer and full payment are validated and published together. */
export function payFundedPayment(
  state: FinanceState,
  input: FundedPaymentInput,
  today: string,
): FinanceState {
  const cycle = state.goalFundCycles?.find(
    (entry) => entry.id === input.cycleId,
  );
  ensure(
    cycle?.status === "active",
    "Этот цикл фонда уже завершён или отменён.",
  );
  const template = state.recurring.find(
    (entry) => entry.id === cycle.recurringId,
  );
  const occurrence =
    template &&
    resolvePaymentOccurrence(
      template,
      cycle.occurrenceDate,
      cycle.recurringVersionId,
    );
  const goal = state.goals.find((entry) => entry.id === cycle.goalId);
  ensure(
    occurrence && goal,
    "Связанные цель или обязательство уже изменились.",
  );
  ensure(
    !fundPaymentAlreadyRecorded(state, cycle),
    "У платежа уже есть оплата или ожидание. Отмените ожидание перед оплатой из фонда.",
  );
  ensure(
    !(occurrence.payment.skippedDates ?? []).includes(cycle.occurrenceDate),
    "Сначала верните платёж в план.",
  );
  const amount =
    input.releaseAmount ??
    Math.min(goalSaved(state, goal, today), occurrence.payment.amount);
  checkAmount(amount, true);
  ensure(
    amount <= goalSaved(state, goal, today) &&
      amount <= occurrence.payment.amount,
    "Возврат из фонда не может превышать накопленное или полный платёж.",
  );
  ensure(
    (state.goalReleases?.length ?? 0) + (amount > 0 ? 1 : 0) <= 500,
    "В учёте уже 500 освобождений фондов.",
  );
  ensure(
    state.transactions.length + (amount > 0 ? 2 : 1) <= 20000,
    "В учёте допустимо не более 20 000 операций.",
  );
  const spending = state.accounts.find(
    (entry) => entry.id === occurrence.payment.accountId,
  );
  ensure(
    spending?.kind === "spending" && !spending.archived,
    "Восстановите повседневный счёт оплаты фонда.",
  );
  const savings = state.accounts.find(
    (entry) => entry.id === input.savingsAccountId,
  );
  if (amount > 0) {
    ensure(
      savings?.kind === "savings" &&
        !savings.archived &&
        accountCurrency(state, savings.id) === (goal.currency ?? "RUB"),
      "Выберите активный накопительный счёт в валюте фонда.",
    );
    ensure(
      accountAvailability(state, savings.id, today).available >= amount,
      "На выбранном накопительном счёте недостаточно свободных средств. Выберите другой счёт или уменьшите возврат.",
    );
  }
  const payment: Transaction = {
    id: uid(),
    type: "expense",
    title: occurrence.payment.name,
    amount: occurrence.payment.amount,
    baseAmount: accountToBase(state, occurrence.payment.amount, spending.id),
    date: today,
    category: occurrence.payment.category,
    accountId: spending.id,
    recurringId: template!.id,
    recurringVersionId:
      occurrence.versionId === "legacy" ? undefined : occurrence.versionId,
    occurrenceDate: cycle.occurrenceDate,
  };
  const transfer: Transaction | undefined =
    amount > 0
      ? {
          id: uid(),
          type: "transfer",
          title: `Возврат фонда: ${goal.name}`.slice(0, 120),
          amount,
          baseAmount: accountToBase(state, amount, savings!.id),
          date: today,
          category: occurrence.payment.category,
          accountId: savings!.id,
          toAccountId: spending.id,
        }
      : undefined;
  const facts = transfer ? [payment, transfer] : [payment];
  const next: FinanceState = {
    ...state,
    version: 7,
    transactions: [...facts, ...state.transactions],
    goalFundCycles: state.goalFundCycles!.map((entry) =>
      entry.id === cycle.id
        ? {
            ...entry,
            status: "paid",
            paidOn: today,
            paymentTransactionId: payment.id,
          }
        : entry,
    ),
    goalReleases: transfer
      ? [
          ...(state.goalReleases ?? []),
          {
            id: uid(),
            goalId: goal.id,
            cycleId: cycle.id,
            date: today,
            amount,
            transferId: transfer.id,
          },
        ]
      : state.goalReleases,
  };
  for (const transaction of facts) {
    ensure(
      !state.transactions.some((entry) => entry.id === transaction.id),
      "Операция с таким ID уже существует.",
    );
    const error = validateTransaction(
      {
        ...next,
        transactions: next.transactions.filter(
          (entry) => entry.id !== transaction.id,
        ),
      },
      transaction,
      today,
    );
    ensure(!error, error ?? "Не удалось записать оплату фонда.");
  }
  checkSavings(next, today);
  checkCurrencyAmounts(next, today);
  validateTransactionAmountsState(next);
  validateDebts(next, today);
  validateCreditAccounts(next, today);
  validateAccountArchives(next, today);
  validateGoalFunds(next, today);
  return next;
}
