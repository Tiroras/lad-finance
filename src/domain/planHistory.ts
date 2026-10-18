import { dateInMonth, validDate } from "../shared/lib/dates";
import { accountCurrency } from "./currency";
import { incomeOccurrenceKey, resolveIncomeOccurrence } from "./incomes";
import { transactionStatus } from "./transactionStatus";
import { paymentForMonth } from "./payments";
import { isScheduledDate, validateSchedules } from "./recurrence";
import type {
  FinanceState,
  PlannedIncome,
  Recurring,
  Transaction,
} from "./types";

type Interval = {
  id: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legacy?: true;
  voided?: true;
};

function intervals(versions: readonly Interval[]) {
  const ids = new Set<string>();
  let previous: Interval | undefined;
  for (const [index, version] of versions.entries()) {
    if (
      !version.id ||
      ids.has(version.id) ||
      !validDate(version.effectiveFrom) ||
      version.effectiveFrom < "2000-01-01" ||
      version.effectiveFrom > "2100-12-31" ||
      (version.effectiveTo !== undefined &&
        (!validDate(version.effectiveTo) ||
          version.effectiveTo <= version.effectiveFrom ||
          version.effectiveTo > "2100-12-31")) ||
      (!version.voided &&
        previous &&
        (!previous.effectiveTo ||
          previous.effectiveTo > version.effectiveFrom)) ||
      (version.id === "legacy") !== !!version.legacy ||
      (version.legacy && index !== 0)
    )
      throw new Error(
        "История условий содержит повтор, пересечение или неверную границу версии.",
      );
    ids.add(version.id);
    if (!version.voided) previous = version;
  }
}

const contains = (version: Interval, date: string) =>
  date >= version.effectiveFrom &&
  (!version.effectiveTo || date < version.effectiveTo);

/** Preserve permissive month/once keys of old facts; new keys are exact dates. */
export function paymentLinkValid(plan: Recurring, transaction: Transaction) {
  const date = transaction.occurrenceDate;
  if (!date) return false;
  if (!plan.versions)
    return (
      (!transaction.recurringVersionId ||
        transaction.recurringVersionId === "legacy") &&
      (!plan.schedule || isScheduledDate(plan.schedule, date))
    );
  const version = plan.versions.find(
    (v) => v.id === (transaction.recurringVersionId ?? "legacy"),
  );
  if (!version) return false;
  const terms = {
    ...plan,
    ...version,
    schedule: version.schedule,
    history: version.history,
    amountHistory: version.amountHistory,
    skippedMonths: version.skippedMonths,
    skippedDates: version.skippedDates,
    versions: undefined,
  };
  const original = version.schedule
    ? date
    : dateInMonth(date, paymentForMonth(terms, date).day);
  return (
    (version.legacy || date === original) &&
    (!version.schedule || isScheduledDate(version.schedule, date)) &&
    (transactionStatus(transaction) === "cancelled" ||
      (version.legacy && original < version.effectiveFrom) ||
      version.inactiveLegacy ||
      (!version.voided && contains(version, original)))
  );
}

export function incomeLinkValid(plan: PlannedIncome, transaction: Transaction) {
  const date = transaction.incomeOccurrenceDate;
  if (!date) return false;
  if (!plan.versions)
    return (
      (!transaction.incomeVersionId ||
        transaction.incomeVersionId === "legacy") &&
      (!plan.schedule || isScheduledDate(plan.schedule, date))
    );
  const version = plan.versions.find(
    (v) => v.id === (transaction.incomeVersionId ?? "legacy"),
  );
  if (!version) return false;
  const original =
    version.repeat === "once"
      ? version.date
      : version.schedule
        ? date
        : dateInMonth(date, Number(version.date.slice(-2)));
  return (
    (version.legacy || original === date) &&
    (!version.schedule || isScheduledDate(version.schedule, date)) &&
    (transactionStatus(transaction) === "cancelled" ||
      (version.legacy && original < version.effectiveFrom) ||
      (!version.voided && contains(version, original)))
  );
}

export function validatePlanHistory(state: FinanceState) {
  for (const plan of state.recurring) {
    if (!plan.versions) continue;
    intervals(plan.versions);
    if (!plan.versions.some((version) => !version.voided))
      throw new Error(
        "История плана должна содержать действовавшие или приостановленные условия.",
      );
    if (!plan.versions.length || !plan.versions[0].legacy)
      throw new Error("История платежа должна сохранять исходную версию.");
    if (
      plan.active !==
      (plan.versions.filter((v) => !v.voided).at(-1)?.effectiveTo === undefined)
    )
      throw new Error(
        "Статус платежа не соответствует границе его последних условий.",
      );
    for (const version of plan.versions) {
      if (version.inactiveLegacy && (!version.legacy || !version.effectiveTo))
        throw new Error(
          "Неизвестная история выключенного платежа отмечается только в закрытой исходной версии.",
        );
      if (
        !state.accounts.some(
          (a) => a.id === version.accountId && a.kind === "spending",
        ) ||
        !state.categories.some((c) => c.id === version.category) ||
        accountCurrency(state, version.accountId) !==
          accountCurrency(state, plan.accountId)
      )
        throw new Error(
          "Исторические условия платежа ссылаются на недоступный счёт, другую валюту или категорию.",
        );
      const snapshot: Recurring = {
        ...plan,
        ...version,
        schedule: version.schedule,
        history: version.history,
        amountHistory: version.amountHistory,
        skippedMonths: version.skippedMonths,
        skippedDates: version.skippedDates,
        versions: undefined,
        startsOn: version.effectiveFrom,
      };
      validateSchedules({
        ...state,
        recurring: [snapshot],
        plannedIncomes: [],
      });
      if (
        version.history &&
        new Set(version.history.map((h) => h.untilMonth)).size !==
          version.history.length
      )
        throw new Error("В истории условий повторяется месяц.");
    }
  }
  for (const plan of state.plannedIncomes ?? []) {
    if (plan.paused && !plan.versions)
      throw new Error("Пауза дохода требует истории с известной границей.");
    if (plan.versions) {
      intervals(plan.versions);
      if (!plan.versions.some((version) => !version.voided))
        throw new Error(
          "История плана должна содержать действовавшие или приостановленные условия.",
        );
      if (!plan.versions.length || !plan.versions[0].legacy)
        throw new Error("История дохода должна сохранять исходную версию.");
      if (
        !!plan.paused !==
        (plan.versions.filter((v) => !v.voided).at(-1)?.effectiveTo !==
          undefined)
      )
        throw new Error(
          "Пауза дохода не соответствует последней версии условий.",
        );
      for (const version of plan.versions) {
        if (
          !state.accounts.some(
            (a) => a.id === version.accountId && a.kind === "spending",
          ) ||
          accountCurrency(state, version.accountId) !==
            accountCurrency(state, plan.accountId)
        )
          throw new Error(
            "Исторический доход ссылается на недоступный счёт или другую валюту.",
          );
        validateSchedules({
          ...state,
          recurring: [],
          plannedIncomes: [
            {
              ...plan,
              ...version,
              schedule: version.schedule,
              versions: undefined,
            },
          ],
        });
      }
    }
    const keys = new Set<string>();
    for (const override of plan.occurrenceOverrides ?? []) {
      const key = incomeOccurrenceKey(
        plan,
        override.occurrenceDate,
        override.versionId,
      );
      if (
        keys.has(key) ||
        !resolveIncomeOccurrence(
          plan,
          override.occurrenceDate,
          override.versionId,
        )
      )
        throw new Error(
          "Перенос или отмена дохода ссылается на отсутствующее либо повторяющееся событие.",
        );
      keys.add(key);
    }
  }
  for (const transaction of state.transactions) {
    if (
      (transaction.recurringVersionId && !transaction.recurringId) ||
      (transaction.incomeVersionId && !transaction.plannedIncomeId)
    )
      throw new Error("Версия операции должна ссылаться на свой план.");
  }
}
