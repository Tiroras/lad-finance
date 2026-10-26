import { accountBalances } from "./accountBalances";
import { shiftDate, shiftMonth, validDate } from "../shared/lib/dates";
import { accountCurrency, receivedAmount } from "./currency";
import {
  goalContributionOccurrences,
  goalContributions,
  goalSaved,
  goalTransitionConflicts,
} from "./goals";
import { paymentOccurrenceKey, resolvePaymentOccurrence } from "./payments";
import { isPosted, transactionStatus } from "./transactionStatus";
import type { FinanceState, Goal, GoalFundCycle } from "./types";

function requireFund(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Preserve old month boundaries and every already funded occurrence identity. */
export function annualFundStartDate(
  state: FinanceState,
  goal: Goal | undefined,
  today: string,
) {
  if (goal && !goal.versions) return shiftMonth(today, 1);
  const tomorrow = shiftDate(today, 1);
  const lastProtectedDate = goal
    ? goalTransitionConflicts(state, goal, tomorrow).at(-1)
    : undefined;
  return lastProtectedDate ? shiftDate(lastProtectedDate, 1) : tomorrow;
}

export function goalFundCycleForPayment(
  state: FinanceState,
  recurringId: string,
  date: string,
  versionId = "legacy",
) {
  const payment = state.recurring.find((entry) => entry.id === recurringId);
  if (!payment) return undefined;
  const key = paymentOccurrenceKey(payment, date, versionId);
  return state.goalFundCycles?.find(
    (cycle) =>
      cycle.status !== "cancelled" &&
      cycle.recurringId === recurringId &&
      paymentOccurrenceKey(
        payment,
        cycle.occurrenceDate,
        cycle.recurringVersionId,
      ) === key,
  );
}

/** Coverage is a transfer back to spending, never additional income. */
export function goalFundCoverage(
  state: FinanceState,
  cycle: GoalFundCycle,
  today: string,
  atDate = cycle.occurrenceDate,
  includePlanned = true,
) {
  const goal = state.goals.find((entry) => entry.id === cycle.goalId);
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
  if (!goal || !occurrence || cycle.status !== "active")
    return {
      saved: 0,
      planned: 0,
      amount: 0,
      paymentAmount: occurrence?.payment.amount ?? 0,
    };
  const saved = Math.max(0, goalSaved(state, goal, today));
  const planned =
    includePlanned && atDate >= today
      ? goalContributionOccurrences(
          state,
          goal,
          today,
          shiftDate(atDate, 1),
          today,
        ).reduce((sum, event) => sum + event.amount, 0)
      : 0;
  return {
    saved,
    planned,
    amount: Math.min(occurrence.payment.amount, saved + planned),
    paymentAmount: occurrence.payment.amount,
  };
}

/** Validate goal withdrawals and all three facts of a paid annual cycle. */
export function validateGoalFunds(state: FinanceState, today: string) {
  const cycles = state.goalFundCycles ?? [];
  const releases = state.goalReleases ?? [];
  const activeGoals = new Set<string>();
  const occurrenceKeys = new Set<string>();
  const paymentIds = new Set<string>();
  const transferIds = new Set<string>();
  requireFund(
    new Set(cycles.map((entry) => entry.id)).size === cycles.length,
    "Повторяется идентификатор цикла фонда.",
  );
  requireFund(
    new Set(releases.map((entry) => entry.id)).size === releases.length,
    "Повторяется идентификатор освобождения фонда.",
  );
  for (const cycle of cycles) {
    const goal = state.goals.find((entry) => entry.id === cycle.goalId);
    requireFund(goal, "Цель годового фонда не найдена.");
    requireFund(
      validDate(cycle.createdOn) &&
        cycle.createdOn <= today &&
        validDate(cycle.occurrenceDate),
      "Укажите корректные даты цикла фонда.",
    );
    requireFund(
      !cycle.recurringVersionId || cycle.recurringId,
      "Версия фонда должна ссылаться на платёж.",
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
    requireFund(!cycle.recurringId || template, "Платёж фонда не найден.");
    if (cycle.status !== "cancelled" && template) {
      const key = `${template.id}:${paymentOccurrenceKey(template, cycle.occurrenceDate, cycle.recurringVersionId)}`;
      requireFund(
        !occurrenceKeys.has(key),
        "Для этого обязательства уже есть цикл фонда.",
      );
      occurrenceKeys.add(key);
    }
    const cycleReleases = releases.filter(
      (release) => release.cycleId === cycle.id,
    );
    if (cycle.status === "active") {
      requireFund(
        occurrence && cycle.recurringVersionId,
        "Условия платежа фонда изменились. Сначала отмените связь фонда.",
      );
      requireFund(
        occurrence.payment.schedule?.unit === "year",
        "Фонд связывается с годовым платежом.",
      );
      requireFund(
        (goal.currency ?? "RUB") ===
          accountCurrency(state, occurrence.payment.accountId),
        "Валюты фонда и платежа должны совпадать.",
      );
      requireFund(
        !activeGoals.has(goal.id),
        "У цели уже есть активный цикл фонда.",
      );
      activeGoals.add(goal.id);
      requireFund(
        !cycle.paymentTransactionId && !cycle.paidOn && !cycleReleases.length,
        "Активный фонд не должен содержать факты оплаты.",
      );
      requireFund(
        !(occurrence.payment.skippedDates ?? []).includes(cycle.occurrenceDate),
        "Сначала отмените связь фонда, затем пропустите платёж.",
      );
      requireFund(
        !fundPaymentAlreadyRecorded(state, cycle),
        "Оплатите связанный платёж через годовой фонд либо сначала отмените связь.",
      );
    } else if (cycle.status === "paid") {
      const payment = state.transactions.find(
        (entry) => entry.id === cycle.paymentTransactionId,
      );
      requireFund(
        payment &&
          isPosted(payment) &&
          payment.type === "expense" &&
          !payment.debtId &&
          !payment.refundOf &&
          !payment.splits,
        "Не найдена полная оплата годового фонда.",
      );
      requireFund(
        validDate(cycle.paidOn ?? "") &&
          cycle.paidOn! >= cycle.createdOn &&
          cycle.paidOn === payment.date &&
          payment.date <= today,
        "Дата оплаты фонда не совпадает с расходом.",
      );
      requireFund(
        accountCurrency(state, payment.accountId) === (goal.currency ?? "RUB"),
        "Валюта оплаты фонда не совпадает с целью.",
      );
      requireFund(
        !paymentIds.has(payment.id),
        "Одна оплата связана с несколькими фондами.",
      );
      paymentIds.add(payment.id);
      if (template)
        requireFund(
          payment.recurringId === template.id &&
            !!payment.occurrenceDate &&
            paymentOccurrenceKey(
              template,
              payment.occurrenceDate,
              payment.recurringVersionId,
            ) ===
              paymentOccurrenceKey(
                template,
                cycle.occurrenceDate,
                cycle.recurringVersionId,
              ),
          "Оплата ссылается на другое обязательство фонда.",
        );
      requireFund(
        cycleReleases.length <= 1 &&
          cycleReleases.reduce((sum, release) => sum + release.amount, 0) <=
            payment.amount,
        "Освобождение превышает оплату фонда.",
      );
      if (occurrence)
        requireFund(
          payment.amount === occurrence.payment.amount &&
            payment.category === occurrence.payment.category &&
            payment.accountId === occurrence.payment.accountId,
          "Оплата фонда должна соответствовать полной сумме и счёту обязательства.",
        );
    } else {
      requireFund(
        cycle.status === "cancelled" &&
          !cycleReleases.length &&
          !cycle.paymentTransactionId &&
          !cycle.paidOn,
        "Отменённая связь фонда не должна содержать оплату.",
      );
    }
  }
  for (const release of releases) {
    const cycle = cycles.find((entry) => entry.id === release.cycleId);
    const goal = state.goals.find((entry) => entry.id === release.goalId);
    const transfer = state.transactions.find(
      (entry) => entry.id === release.transferId,
    );
    const payment = state.transactions.find(
      (entry) => entry.id === cycle?.paymentTransactionId,
    );
    requireFund(goal, "Цель возврата накоплений не найдена.");
    if (release.cycleId !== undefined)
      requireFund(
        cycle?.status === "paid" && cycle.goalId === goal.id,
        "Освобождение должно принадлежать оплаченному циклу цели.",
      );
    else requireFund(state.version >= 9, "Вывод из цели требует формат 9.");
    requireFund(
      Number.isSafeInteger(release.amount) &&
        release.amount > 0 &&
        validDate(release.date) &&
        release.date <= today &&
        (!cycle || release.date === cycle.paidOn),
      "Некорректные сумма или дата освобождения фонда.",
    );
    requireFund(
      transfer &&
        isPosted(transfer) &&
        transfer.type === "transfer" &&
        transfer.amount === release.amount &&
        (!cycle || receivedAmount(transfer) === release.amount) &&
        transfer.date === release.date &&
        !transfer.goalId &&
        !transfer.debtId &&
        !transfer.recurringId &&
        !transfer.plannedIncomeId,
      "Освобождение фонда должно совпадать с переводом накоплений.",
    );
    requireFund(
      state.accounts.find((entry) => entry.id === transfer.accountId)?.kind ===
        "savings" &&
        state.accounts.find((entry) => entry.id === transfer.toAccountId)
          ?.kind === "spending" &&
        (!cycle || payment?.accountId === transfer.toAccountId) &&
        accountCurrency(state, transfer.accountId) ===
          (goal.currency ?? "RUB") &&
        (!cycle ||
          accountCurrency(state, transfer.toAccountId) ===
            (goal.currency ?? "RUB")),
      "Возврат из цели должен идти с накопительного счёта в валюте цели на повседневный счёт.",
    );
    requireFund(
      !transferIds.has(transfer.id),
      "Один перевод освобождает накопления нескольких целей.",
    );
    transferIds.add(transfer.id);
    requireFund(
      goalSaved(state, goal, release.date) >= 0,
      "Вывод превышает накопленные средства цели.",
    );
  }
  // Later edits must retain the backing of every recorded release. Validate
  // calendar-day closing balances; pending intentions are not historical cash.
  for (const date of new Set(releases.map((release) => release.date))) {
    const balances = accountBalances(state, date);
    const contributions = goalContributions(state, date);
    const released = new Map<string, number>();
    for (const release of releases)
      if (release.date <= date)
        released.set(
          release.goalId,
          (released.get(release.goalId) ?? 0) + release.amount,
        );
    const allocated = new Map<string, number>();
    for (const goal of state.goals) {
      const code = goal.currency ?? "RUB";
      allocated.set(
        code,
        (allocated.get(code) ?? 0) +
          goal.initialSaved +
          (contributions.get(goal.id)?.total ?? 0) -
          (released.get(goal.id) ?? 0),
      );
    }
    for (const [code, amount] of allocated) {
      const savings = state.accounts
        .filter(
          (account) =>
            account.kind === "savings" && (account.currency ?? "RUB") === code,
        )
        .reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0);
      requireFund(
        savings >= amount,
        releases.some((release) => release.cycleId && release.date === date)
          ? "Изменение оставляет оплату фонда без обеспеченных накоплений на дату возврата."
          : "Изменение оставляет цели без обеспеченных накоплений на дату возврата.",
      );
    }
    for (const release of releases.filter((entry) => entry.date === date)) {
      const source = state.transactions.find(
        (entry) => entry.id === release.transferId,
      )!.accountId;
      requireFund(
        (balances.get(source) ?? 0) >= 0,
        "На дату возврата недостаточно денег на накопительном счёте.",
      );
    }
  }
  for (const goal of state.goals) {
    requireFund(
      goalSaved(state, goal, today) >= 0,
      "Вывод превышает накопленные средства цели.",
    );
    if (
      releases.some((release) => release.goalId === goal.id && !release.cycleId)
    )
      requireFund(
        goalSaved(state, goal, today) <= goal.target,
        "Изменение возвращает в цель больше её суммы. Сначала увеличьте сумму цели или исправьте последующие пополнения.",
      );
  }
}

/** Ordinary edits may keep metadata but must not change or delete a linked fact. */
export function assertGoalFundTransactionsUnchanged(
  before: FinanceState,
  after: FinanceState,
) {
  const ids = new Set([
    ...(before.goalFundCycles ?? []).flatMap((cycle) =>
      cycle.paymentTransactionId ? [cycle.paymentTransactionId] : [],
    ),
    ...(before.goalReleases ?? [])
      .filter((release) => release.cycleId !== undefined)
      .map((release) => release.transferId),
  ]);
  for (const id of ids) {
    const original = before.transactions.find((entry) => entry.id === id);
    const changed = after.transactions.find((entry) => entry.id === id);
    const monetary = (entry: typeof original) =>
      entry &&
      JSON.stringify(
        Object.fromEntries(
          Object.entries(entry)
            .filter(
              ([key, value]) =>
                value !== undefined &&
                !["title", "note", "baseAmount"].includes(key),
            )
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      );
    requireFund(
      original && changed && monetary(original) === monetary(changed),
      "Это часть оплаты годового фонда. Отдельно менять сумму, дату, счета или удалять связанное движение нельзя.",
    );
  }
}

export function assertGoalFundPlansPreserved(
  before: FinanceState,
  after: FinanceState,
) {
  for (const cycle of before.goalFundCycles ?? []) {
    if (
      cycle.status !== "active" ||
      !after.goalFundCycles?.some(
        (entry) => entry.id === cycle.id && entry.status === "active",
      )
    )
      continue;
    const oldTemplate = before.recurring.find(
      (entry) => entry.id === cycle.recurringId,
    );
    const newTemplate = after.recurring.find(
      (entry) => entry.id === cycle.recurringId,
    );
    const previous =
      oldTemplate &&
      resolvePaymentOccurrence(
        oldTemplate,
        cycle.occurrenceDate,
        cycle.recurringVersionId,
      );
    const current =
      newTemplate &&
      resolvePaymentOccurrence(
        newTemplate,
        cycle.occurrenceDate,
        cycle.recurringVersionId,
      );
    requireFund(
      previous &&
        current &&
        previous.payment.amount === current.payment.amount &&
        previous.payment.accountId === current.payment.accountId &&
        previous.payment.category === current.payment.category &&
        !(current.payment.skippedDates ?? []).includes(cycle.occurrenceDate),
      "Изменение затрагивает годовой фонд. Сначала отмените его связь с платежом; накопления и история сохранятся.",
    );
  }
}

export function fundPaymentAlreadyRecorded(
  state: FinanceState,
  cycle: GoalFundCycle,
) {
  const template = state.recurring.find(
    (entry) => entry.id === cycle.recurringId,
  );
  return (
    !!template &&
    state.transactions.some(
      (entry) =>
        transactionStatus(entry) !== "cancelled" &&
        entry.recurringId === template.id &&
        entry.occurrenceDate &&
        paymentOccurrenceKey(
          template,
          entry.occurrenceDate,
          entry.recurringVersionId,
        ) ===
          paymentOccurrenceKey(
            template,
            cycle.occurrenceDate,
            cycle.recurringVersionId,
          ),
    )
  );
}
