import {
  dateInMonth,
  monthKey,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import type {
  FinanceState,
  IncomeTermsVersion,
  PlannedIncome,
  Transaction,
} from "./types";
import { isScheduledDate, iterateScheduleDates } from "./recurrence";
import {
  isPosted,
  pendingProjection,
  transactionStatus,
} from "./transactionStatus";

/** Legacy is virtual until the first history action; reading old data adds nothing. */
export function incomeVersions(plan: PlannedIncome): IncomeTermsVersion[] {
  return (
    plan.versions ?? [
      {
        id: "legacy",
        legacy: true,
        effectiveFrom: plan.date,
        amount: plan.amount,
        accountId: plan.accountId,
        date: plan.date,
        repeat: plan.repeat,
        ...(plan.schedule ? { schedule: plan.schedule } : {}),
      },
    ]
  );
}
function conditions(
  plan: PlannedIncome,
  version: IncomeTermsVersion,
): PlannedIncome {
  return {
    ...plan,
    amount: version.amount,
    accountId: version.accountId,
    date: version.date,
    repeat: version.repeat,
    schedule: version.schedule,
  };
}
function originalKey(
  version: Pick<PlannedIncome, "repeat" | "schedule">,
  date: string,
) {
  return version.repeat === "once"
    ? "once"
    : version.schedule
      ? date
      : monthKey(date);
}
export function incomeOccurrenceKey(
  plan: PlannedIncome,
  date: string,
  versionId = "legacy",
) {
  const version = incomeVersions(plan).find((entry) => entry.id === versionId);
  return `${versionId}:${originalKey(version ?? plan, date)}`;
}
/** Old monthly/once links could store an arbitrary date while retaining their key. */
export function incomeOriginalDate(
  plan: PlannedIncome,
  date: string,
  versionId = "legacy",
) {
  const version = incomeVersions(plan).find((entry) => entry.id === versionId);
  if (!version) return date;
  return version.repeat === "once"
    ? version.date
    : version.schedule
      ? date
      : dateInMonth(date, Number(version.date.slice(-2)));
}
export interface IncomeOccurrence {
  plan: PlannedIncome;
  date: string;
  occurrenceDate: string;
  versionId: string;
  cancelled?: boolean;
  pending?: Transaction;
}
export function resolveIncomeOccurrence(
  plan: PlannedIncome,
  originalDate: string,
  versionId = "legacy",
): IncomeOccurrence | undefined {
  const version = incomeVersions(plan).find((entry) => entry.id === versionId);
  if (
    !version ||
    version.voided ||
    !validDate(originalDate) ||
    originalDate < version.effectiveFrom ||
    (version.effectiveTo && originalDate >= version.effectiveTo) ||
    originalDate < version.date ||
    (version.repeat === "once"
      ? originalDate !== version.date
      : version.schedule
        ? !isScheduledDate(version.schedule, originalDate)
        : originalDate !==
          dateInMonth(originalDate, Number(version.date.slice(-2))))
  )
    return undefined;
  const override = plan.occurrenceOverrides?.find(
    (entry) =>
      entry.versionId === versionId &&
      originalKey(version, entry.occurrenceDate) ===
        originalKey(version, originalDate),
  );
  return {
    plan: conditions(plan, version),
    date: override?.expectedDate ?? originalDate,
    occurrenceDate: originalDate,
    versionId,
    ...(override?.cancelled ? { cancelled: true } : {}),
  };
}
export function canLinkIncome(
  transaction: Transaction,
  plan: PlannedIncome,
  today: string,
) {
  return (
    transaction.type === "income" &&
    isPosted(transaction) &&
    !transaction.plannedIncomeId &&
    !transaction.recurringId &&
    !transaction.refundOf &&
    !transaction.debtId &&
    transaction.accountId === plan.accountId &&
    transaction.amount === plan.amount &&
    transaction.date <= today
  );
}
export function incomeReceived(
  state: FinanceState,
  plan: PlannedIncome,
  date: string,
  today: string,
  versionId = "legacy",
) {
  const key = incomeOccurrenceKey(plan, date, versionId);
  return state.transactions.find(
    (t) =>
      t.type === "income" &&
      isPosted(t) &&
      t.date <= today &&
      t.plannedIncomeId === plan.id &&
      t.incomeOccurrenceDate &&
      incomeOccurrenceKey(plan, t.incomeOccurrenceDate, t.incomeVersionId) ===
        key,
  );
}
export function incomePending(
  state: FinanceState,
  plan: PlannedIncome,
  date: string,
  versionId = "legacy",
) {
  const key = incomeOccurrenceKey(plan, date, versionId);
  return state.transactions.find(
    (t) =>
      transactionStatus(t) === "pending" &&
      t.plannedIncomeId === plan.id &&
      t.incomeOccurrenceDate &&
      incomeOccurrenceKey(plan, t.incomeOccurrenceDate, t.incomeVersionId) ===
        key,
  );
}
function* iterateIncomeOccurrences(
  state: FinanceState,
  start: string,
  end: string,
  asOf: string,
  accountId?: string,
): Generator<IncomeOccurrence> {
  const plans = new Map(
    (state.plannedIncomes ?? []).map((plan) => [plan.id, plan]),
  );
  const received = new Set<string>(),
    pending = new Map<string, Transaction>();
  for (const transaction of state.transactions) {
    const plan = transaction.plannedIncomeId
      ? plans.get(transaction.plannedIncomeId)
      : undefined;
    if (!plan || !transaction.incomeOccurrenceDate) continue;
    const key = `${plan.id}:${incomeOccurrenceKey(plan, transaction.incomeOccurrenceDate, transaction.incomeVersionId)}`;
    if (transactionStatus(transaction) === "pending")
      pending.set(key, transaction);
    if (
      transaction.type === "income" &&
      isPosted(transaction) &&
      transaction.date <= asOf
    )
      received.add(key);
  }
  const added = new Set<string>();
  for (const plan of plans.values()) {
    const entryAt = (date: string, versionId: string) => {
      const entry = resolveIncomeOccurrence(plan, date, versionId);
      if (
        !entry ||
        entry.cancelled ||
        entry.date < start ||
        entry.date >= end ||
        (accountId && entry.plan.accountId !== accountId)
      )
        return;
      const key = `${plan.id}:${incomeOccurrenceKey(plan, date, versionId)}`;
      if (received.has(key) || pending.has(key) || added.has(key)) return;
      added.add(key);
      return entry;
    };
    for (const version of incomeVersions(plan)) {
      if (version.voided || (accountId && version.accountId !== accountId))
        continue;
      const from =
        start > version.effectiveFrom ? start : version.effectiveFrom;
      const until =
        version.effectiveTo && version.effectiveTo < end
          ? version.effectiveTo
          : end;
      if (from >= until) continue;
      if (version.repeat === "once") {
        const entry = entryAt(version.date, version.id);
        if (entry) yield entry;
      } else if (version.schedule) {
        for (const date of iterateScheduleDates(
          version.schedule,
          from,
          until,
        )) {
          const entry = entryAt(date, version.id);
          if (entry) yield entry;
        }
      } else
        for (
          let month = `${monthKey(from)}-01`;
          month < until;
          month = shiftMonth(month, 1)
        ) {
          const entry = entryAt(
            dateInMonth(month, Number(version.date.slice(-2))),
            version.id,
          );
          if (entry) yield entry;
        }
    }
    // Moved events can originate outside the requested projection window.
    for (const override of plan.occurrenceOverrides ?? []) {
      const entry = entryAt(override.occurrenceDate, override.versionId);
      if (entry) yield entry;
    }
  }
  for (const transaction of pending.values()) {
    const plan = plans.get(transaction.plannedIncomeId!)!;
    const entry = resolveIncomeOccurrence(
      plan,
      transaction.incomeOccurrenceDate!,
      transaction.incomeVersionId,
    );
    const date = pendingProjection(transaction, asOf);
    if (
      entry &&
      !entry.cancelled &&
      date &&
      date >= start &&
      date < end &&
      (!accountId || entry.plan.accountId === accountId)
    )
      yield { ...entry, date, pending: transaction };
  }
}
export function incomeOccurrences(
  state: FinanceState,
  start: string,
  end: string,
  asOf = start,
): IncomeOccurrence[] {
  return [...iterateIncomeOccurrences(state, start, end, asOf)].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.plan.id.localeCompare(b.plan.id) ||
      a.versionId.localeCompare(b.versionId) ||
      a.occurrenceDate.localeCompare(b.occurrenceDate),
  );
}
/** Stop at the first outstanding occurrence; never allocate a century of events. */
export function incomeAccountObligation(
  state: FinanceState,
  plan: PlannedIncome,
  accountId: string,
  today: string,
): boolean {
  if (
    state.transactions.some(
      (transaction) =>
        transaction.plannedIncomeId === plan.id &&
        transaction.accountId === accountId &&
        transactionStatus(transaction) === "pending",
    )
  )
    return true;
  return !iterateIncomeOccurrences(
    { ...state, plannedIncomes: [plan] },
    "2000-01-01",
    "2101-01-01",
    today,
    accountId,
  ).next().done;
}
