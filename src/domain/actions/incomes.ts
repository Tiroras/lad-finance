import { validatePlanHistory } from "../planHistory";
import { validateAccountArchives } from "../accountArchive";
import { accountCurrency } from "../currency";
import { localDate, shiftDate, uid, validDate } from "../finance";
import {
  canLinkIncome,
  incomeOccurrenceKey,
  incomeOriginalDate,
  incomePending,
  incomeReceived,
  incomeVersions,
  resolveIncomeOccurrence,
} from "../incomes";
import { scheduleSchema, validateSchedules } from "../recurrence";
import type { FinanceState, IncomeTermsVersion, PlannedIncome } from "../types";
import { postPendingTransaction, saveTransaction } from "./transactions";
import { transactionStatus } from "../transactionStatus";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  ensure,
} from "./validation";

export type IncomeInput = Pick<
  PlannedIncome,
  "name" | "amount" | "date" | "repeat" | "schedule" | "accountId"
> & { id?: string; effectiveFrom?: string };
const validPlanDate = (date: string) =>
  validDate(date) && date >= "2000-01-01" && date <= "2100-12-31";
function changed(
  state: FinanceState,
  plan: PlannedIncome,
  today: string,
  history = true,
): FinanceState {
  const next: FinanceState = {
    ...state,
    ...(history
      ? { version: state.version >= 6 ? state.version : (6 as const) }
      : {}),
    plannedIncomes: (state.plannedIncomes ?? []).map((entry) =>
      entry.id === plan.id ? plan : entry,
    ),
  };
  validateSchedules(next);
  validatePlanHistory(next);
  validateAccountArchives(next, today);
  checkCurrencyAmounts(next, today);
  return next;
}
function terms(
  input: IncomeInput,
): Pick<
  IncomeTermsVersion,
  "amount" | "accountId" | "date" | "repeat" | "schedule"
> {
  return {
    amount: input.amount,
    accountId: input.accountId,
    date: input.date,
    repeat: input.repeat,
    ...(input.schedule ? { schedule: { ...input.schedule } } : {}),
  };
}
export function incomeTermsChanged(
  original: PlannedIncome,
  input: Pick<
    PlannedIncome,
    "amount" | "accountId" | "date" | "repeat" | "schedule"
  >,
) {
  return (
    original.amount !== input.amount ||
    original.accountId !== input.accountId ||
    original.date !== input.date ||
    original.repeat !== input.repeat ||
    original.schedule?.unit !== input.schedule?.unit ||
    original.schedule?.interval !== input.schedule?.interval ||
    original.schedule?.anchor !== input.schedule?.anchor
  );
}
function materializeVersions(plan: PlannedIncome, today: string) {
  const versions = incomeVersions(plan);
  if (plan.versions || versions[0].effectiveFrom <= today) return versions;
  // A known future plan already exists today; its first occurrence stays in date.
  return [{ ...versions[0], effectiveFrom: today }];
}
function checkHistoryRoom(plan: PlannedIncome) {
  ensure(
    incomeVersions(plan).length < 200,
    "В истории дохода уже 200 версий. Создайте отдельный план.",
  );
}
export function incomeTransitionConflicts(
  state: FinanceState,
  plan: PlannedIncome,
  versionId: string,
  boundary: string,
) {
  const dates = state.transactions
    .filter(
      (entry) =>
        entry.plannedIncomeId === plan.id &&
        transactionStatus(entry) !== "cancelled" &&
        (entry.incomeVersionId ?? "legacy") === versionId &&
        entry.incomeOccurrenceDate,
    )
    .map((entry) =>
      incomeOriginalDate(plan, entry.incomeOccurrenceDate!, versionId),
    )
    .filter((date) => date >= boundary);
  for (const entry of plan.occurrenceOverrides ?? [])
    if (entry.versionId === versionId && entry.occurrenceDate >= boundary)
      dates.push(entry.occurrenceDate);
  return [...new Set(dates)].sort();
}
function ensureBoundary(
  state: FinanceState,
  plan: PlannedIncome,
  version: IncomeTermsVersion,
  boundary: string,
) {
  const conflicts = incomeTransitionConflicts(
    state,
    plan,
    version.id,
    boundary,
  );
  ensure(
    !conflicts.length,
    `Новые условия затрагивают полученные, отменённые, перенесённые или ожидающие поступления: ${conflicts.slice(0, 12).join(", ")}. Выберите границу после ${conflicts.at(-1) ?? boundary}.`,
  );
}
export function savePlannedIncome(
  state: FinanceState,
  input: IncomeInput,
  today = localDate(),
): FinanceState {
  const plans = state.plannedIncomes ?? [],
    original = plans.find((p) => p.id === input.id);
  ensure(!input.id || original, "Планируемый доход уже удалён.");
  ensure(
    original || plans.length < 200,
    "Можно создать не более 200 планируемых доходов.",
  );
  ensure(
    !original ||
      accountCurrency(state, original.accountId) ===
        accountCurrency(state, input.accountId),
    "Для смены валюты создайте новый план. Валюта существующего плана сохраняется для истории и сценариев.",
  );
  checkName(input.name);
  checkAmount(input.amount);
  ensure(
    !input.schedule || scheduleSchema.safeParse(input.schedule).success,
    "Укажите корректный интервал повторения и дату начала.",
  );
  ensure(
    !input.schedule ||
      (input.repeat !== "once" && input.schedule.anchor === input.date),
    "Дата первого поступления должна совпадать с началом повторений.",
  );
  ensure(
    validPlanDate(input.date),
    "Укажите корректную дату дохода от 2000 до 2100 года.",
  );
  ensure(
    state.accounts.some(
      (a) => a.id === input.accountId && a.kind === "spending" && !a.archived,
    ),
    "Выберите повседневный счёт.",
  );
  ensure(
    ["once", "monthly"].includes(input.repeat),
    "Выберите периодичность дохода.",
  );
  if (!original) {
    const plan: PlannedIncome = {
      id: uid(),
      name: input.name.trim(),
      ...terms(input),
    };
    const next = { ...state, plannedIncomes: [...plans, plan] };
    validateSchedules(next);
    validatePlanHistory(next);
    checkCurrencyAmounts(next, today);
    return next;
  }
  if (!incomeTermsChanged(original, input))
    return changed(
      state,
      { ...original, name: input.name.trim() },
      today,
      false,
    );
  ensure(
    !original.paused,
    "Сначала возобновите повторения с прежними условиями, затем назначьте новые условия на будущую дату.",
  );
  const boundary = input.effectiveFrom ?? shiftDate(today, 1);
  ensure(
    validPlanDate(boundary) && boundary > today,
    "Новые условия дохода могут действовать не раньше завтра.",
  );
  const versions = materializeVersions(original, today);
  ensure(
    input.repeat !== "once" || input.date >= boundary,
    "Разовое поступление по новым условиям должно быть не раньше даты их начала.",
  );
  for (const version of versions)
    if (!version.voided) ensureBoundary(state, original, version, boundary);
  checkHistoryRoom(original);
  const previous = versions.map((entry) =>
    entry.voided
      ? entry
      : entry.effectiveFrom >= boundary
        ? { ...entry, voided: true as const }
        : !entry.effectiveTo || entry.effectiveTo > boundary
          ? { ...entry, effectiveTo: boundary }
          : entry,
  );
  return changed(
    state,
    {
      ...original,
      ...terms(input),
      schedule: input.schedule,
      name: input.name.trim(),
      versions: [
        ...previous,
        { id: uid(), effectiveFrom: boundary, ...terms(input) },
      ],
    },
    today,
  );
}
export function deletePlannedIncome(
  state: FinanceState,
  id: string,
): FinanceState {
  return {
    ...state,
    settings:
      state.settings.spendableIncomeId === id
        ? { ...state.settings, spendableIncomeId: undefined }
        : state.settings,
    plannedIncomes: (state.plannedIncomes ?? []).filter((p) => p.id !== id),
    transactions: state.transactions.map((t) =>
      t.plannedIncomeId === id
        ? {
            ...t,
            plannedIncomeId: undefined,
            incomeOccurrenceDate: undefined,
            incomeVersionId: undefined,
          }
        : t,
    ),
  };
}
function occurrence(
  state: FinanceState,
  id: string,
  date: string,
  versionId = "legacy",
) {
  const plan = state.plannedIncomes?.find((entry) => entry.id === id);
  ensure(plan, "Планируемый доход уже удалён.");
  const resolved = resolveIncomeOccurrence(plan, date, versionId);
  ensure(
    resolved,
    "Дата не соответствует сохранённой версии планируемого дохода.",
  );
  return { plan, resolved };
}
export function receivePlannedIncome(
  state: FinanceState,
  id: string,
  date: string,
  today = localDate(),
  transactionId?: string,
  versionId = "legacy",
): FinanceState {
  const { plan, resolved } = occurrence(state, id, date, versionId);
  ensure(!resolved.cancelled, "Сначала верните отменённое поступление в план.");
  if (incomeReceived(state, plan, date, today, versionId)) return state;
  const pending = incomePending(state, plan, date, versionId);
  if (pending) {
    ensure(
      !transactionId || transactionId === pending.id,
      "У этого поступления уже есть ожидание. Сначала проведите или отмените его.",
    );
    return postPendingTransaction(state, pending.id, today, today);
  }
  const link = {
    plannedIncomeId: id,
    incomeOccurrenceDate: date,
    ...(plan.versions || versionId !== "legacy"
      ? { incomeVersionId: versionId }
      : {}),
  };
  if (transactionId) {
    const transaction = state.transactions.find(
      (entry) => entry.id === transactionId,
    );
    ensure(
      transaction && canLinkIncome(transaction, resolved.plan, today),
      "Запись больше не подходит для этого поступления.",
    );
    return saveTransaction(state, { ...transaction, ...link }, today);
  }
  return saveTransaction(
    state,
    {
      type: "income",
      title: plan.name,
      amount: resolved.plan.amount,
      date: today,
      category: "other",
      accountId: resolved.plan.accountId,
      ...link,
    },
    today,
  );
}
function changeOccurrence(
  state: FinanceState,
  id: string,
  date: string,
  patch: { expectedDate?: string; cancelled?: boolean },
  today: string,
  versionId: string,
) {
  const { plan } = occurrence(state, id, date, versionId);
  ensure(
    !incomeReceived(state, plan, date, today, versionId),
    "Доход уже получен. Его фактическая дата и сумма изменяются в истории операций.",
  );
  ensure(
    !incomePending(state, plan, date, versionId),
    "Сначала проведите или отмените ожидание этого поступления.",
  );
  const key = incomeOccurrenceKey(plan, date, versionId);
  const previous = plan.occurrenceOverrides?.find(
    (entry) =>
      incomeOccurrenceKey(plan, entry.occurrenceDate, entry.versionId) === key,
  );
  const others = (plan.occurrenceOverrides ?? []).filter(
    (entry) =>
      incomeOccurrenceKey(plan, entry.occurrenceDate, entry.versionId) !== key,
  );
  ensure(
    others.length < 5000,
    "В плане уже 5000 изменений отдельных поступлений. Создайте отдельный план.",
  );
  return changed(
    state,
    {
      ...plan,
      versions: materializeVersions(plan, today),
      occurrenceOverrides: [
        ...others,
        { ...previous, versionId, occurrenceDate: date, ...patch },
      ],
    },
    today,
  );
}
export function moveIncomeOccurrence(
  state: FinanceState,
  id: string,
  date: string,
  expectedDate: string,
  today = localDate(),
  versionId = "legacy",
) {
  ensure(
    validPlanDate(expectedDate) && expectedDate >= today,
    "Укажите новую ожидаемую дату не раньше сегодня.",
  );
  return changeOccurrence(state, id, date, { expectedDate }, today, versionId);
}
export function setIncomeCancelled(
  state: FinanceState,
  id: string,
  date: string,
  cancelled: boolean,
  today = localDate(),
  versionId = "legacy",
) {
  return changeOccurrence(state, id, date, { cancelled }, today, versionId);
}
export function setIncomePaused(
  state: FinanceState,
  id: string,
  paused: boolean,
  today = localDate(),
) {
  const plan = state.plannedIncomes?.find((entry) => entry.id === id);
  ensure(plan, "Планируемый доход уже удалён.");
  if (!!plan.paused === paused) return state;
  const versions = materializeVersions(plan, today);
  ensure(
    !paused ||
      versions.some((entry) => !entry.voided && entry.repeat !== "once"),
    "Разовое поступление можно отменить отдельно.",
  );
  if (paused) {
    const boundary = shiftDate(today, 1);
    for (const version of versions)
      if (!version.voided) ensureBoundary(state, plan, version, boundary);
    const stopped = versions.map((entry) =>
      entry.voided
        ? entry
        : entry.effectiveFrom >= boundary
          ? { ...entry, voided: true as const }
          : !entry.effectiveTo || entry.effectiveTo > boundary
            ? { ...entry, effectiveTo: boundary }
            : entry,
    );
    const previous = stopped.filter((entry) => !entry.voided).at(-1);
    ensure(
      previous,
      "В истории дохода отсутствуют прежние условия для возобновления.",
    );
    return changed(
      state,
      {
        ...plan,
        ...terms({ ...plan, ...previous }),
        schedule: previous.schedule,
        paused: true,
        versions: stopped,
      },
      today,
    );
  }
  const last = versions.filter((entry) => !entry.voided).at(-1);
  ensure(
    last,
    "В истории дохода отсутствуют прежние условия для возобновления.",
  );
  ensure(
    state.accounts.some(
      (account) => account.id === last.accountId && !account.archived,
    ),
    "Сначала восстановите счёт дохода из архива.",
  );
  // Undo a pause scheduled for tomorrow without changing today's occurrence.
  if (last.effectiveTo && last.effectiveTo > today) {
    const { effectiveTo: _end, ...reopened } = last;
    return changed(
      state,
      {
        ...plan,
        paused: false,
        versions: versions.map((entry) =>
          entry.id === last.id ? reopened : entry,
        ),
      },
      today,
    );
  }
  checkHistoryRoom(plan);
  return changed(
    state,
    {
      ...plan,
      paused: false,
      versions: [
        ...versions,
        {
          id: uid(),
          effectiveFrom: today,
          amount: last.amount,
          accountId: last.accountId,
          date: last.date,
          repeat: last.repeat,
          ...(last.schedule ? { schedule: { ...last.schedule } } : {}),
        },
      ],
    },
    today,
  );
}
