import {
  dateInMonth,
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import { receivedAmount, toBase, MAX_MONEY } from "./currency";
import {
  isScheduledDate,
  iterateScheduleDates,
  scheduleSchema,
} from "./recurrence";
import type {
  FinanceState,
  Goal,
  GoalTermsVersion,
  Transaction,
} from "./types";
import { isPosted } from "./transactionStatus";

export function goalContributions(state: FinanceState, today = localDate()) {
  const contributions = new Map<string, { total: number; month: number }>();
  const month = monthKey(today);
  for (const transaction of state.transactions) {
    if (
      transaction.type !== "transfer" ||
      !isPosted(transaction) ||
      !transaction.goalId ||
      transaction.date > today
    )
      continue;
    const saved = contributions.get(transaction.goalId) ?? {
      total: 0,
      month: 0,
    };
    const amount = receivedAmount(transaction);
    saved.total += amount;
    if (monthKey(transaction.date) === month) saved.month += amount;
    contributions.set(transaction.goalId, saved);
  }
  return contributions;
}

export const goalSaved = (
  state: FinanceState,
  goal: Goal,
  today = localDate(),
) =>
  goal.initialSaved +
  (goalContributions(state, today).get(goal.id)?.total ?? 0) -
  (state.goalReleases ?? [])
    .filter((release) => release.goalId === goal.id && release.date <= today)
    .reduce((sum, release) => sum + release.amount, 0);

/** Reading a legacy goal never creates stored history or an earlier obligation. */
export function goalVersions(goal: Goal, legacyDay = 31): GoalTermsVersion[] {
  return (
    goal.versions ?? [
      {
        id: "legacy",
        effectiveFrom: "2000-01-01",
        legacy: true,
        amount: goal.monthly,
        day: legacyDay,
      },
    ]
  );
}
export function goalTermsAt(goal: Goal, date: string, legacyDay = 31) {
  return goalVersions(goal, legacyDay).find(
    (version) =>
      !version.voided &&
      version.effectiveFrom <= date &&
      (!version.effectiveTo || date < version.effectiveTo),
  );
}
function* dates(
  version: GoalTermsVersion,
  start: string,
  end: string,
): Generator<string> {
  const from = start > version.effectiveFrom ? start : version.effectiveFrom;
  const until =
    version.effectiveTo && version.effectiveTo < end
      ? version.effectiveTo
      : end;
  if (version.voided || from >= until) return;
  if (version.schedule) {
    yield* iterateScheduleDates(version.schedule, from, until);
    return;
  }
  for (
    let month = `${monthKey(from)}-01`;
    month < until;
    month = shiftMonth(month, 1)
  ) {
    const date = dateInMonth(month, version.day ?? 31);
    if (date >= from && date < until) yield date;
  }
}
export function goalOccurrenceKey(version: GoalTermsVersion, date: string) {
  return `${version.id}:${version.legacy ? monthKey(date) : date}`;
}
export function goalContributionIdentity(
  goal: Goal,
  date: string,
  legacyDay = 31,
): { versionId: string; occurrenceDate: string } | undefined {
  const version =
    goalTermsAt(goal, date, legacyDay) ??
    goalVersions(goal, legacyDay).find(
      (entry) => !entry.voided && entry.effectiveFrom > date,
    );
  if (!version) return undefined;
  if (version.legacy)
    return {
      versionId: version.id,
      occurrenceDate: dateInMonth(date, version.day ?? legacyDay),
    };
  const until = version.effectiveTo ?? "2101-01-01";
  const from = date > version.effectiveFrom ? date : version.effectiveFrom;
  const monthDate = dateInMonth(from, version.day ?? legacyDay);
  const next = version.schedule
    ? iterateScheduleDates(version.schedule, from, until).next().value
    : monthDate >= from
      ? monthDate
      : dateInMonth(shiftMonth(from, 1), version.day ?? legacyDay);
  return next && next < until
    ? { versionId: version.id, occurrenceDate: next }
    : undefined;
}

export function goalTransitionConflicts(
  state: FinanceState,
  goal: Goal,
  boundary: string,
) {
  const legacyDay = state.settings.forecast?.goalDay ?? 31;
  return [
    ...new Set(
      state.transactions
        .filter(
          (transaction) =>
            transaction.goalId === goal.id && isPosted(transaction),
        )
        .map(
          (transaction) =>
            transaction.goalOccurrenceDate ??
            goalContributionIdentity(goal, transaction.date, legacyDay)
              ?.occurrenceDate,
        )
        .filter((date): date is string => !!date && date >= boundary),
    ),
  ].sort();
}

function transactionIdentity(
  goal: Goal,
  transaction: Transaction,
  legacyDay: number,
) {
  if (transaction.goalVersionId && transaction.goalOccurrenceDate)
    return {
      versionId: transaction.goalVersionId,
      occurrenceDate: transaction.goalOccurrenceDate,
    };
  // Old facts retain their month identity after the first explicit transition.
  const legacy = goalVersions(goal, legacyDay).find(
    (version) => version.legacy,
  );
  if (
    legacy &&
    !transaction.goalVersionId &&
    !transaction.goalOccurrenceDate &&
    (!legacy.effectiveTo || transaction.date < legacy.effectiveTo)
  )
    return {
      versionId: legacy.id,
      occurrenceDate: dateInMonth(transaction.date, legacy.day ?? legacyDay),
    };
  return goalContributionIdentity(goal, transaction.date, legacyDay);
}
export function goalEventContributions(
  state: FinanceState,
  goal: Goal,
  today: string,
  legacyDay = state.settings.forecast?.goalDay ?? 31,
) {
  const result = new Map<string, number>();
  const versions = goalVersions(goal, legacyDay);
  for (const transaction of state.transactions) {
    if (
      transaction.goalId !== goal.id ||
      transaction.type !== "transfer" ||
      !isPosted(transaction) ||
      transaction.date > today
    )
      continue;
    const identity = transactionIdentity(goal, transaction, legacyDay);
    const version = versions.find((entry) => entry.id === identity?.versionId);
    if (!identity || !version) continue;
    const key = goalOccurrenceKey(version, identity.occurrenceDate);
    result.set(key, (result.get(key) ?? 0) + receivedAmount(transaction));
  }
  return result;
}
export interface GoalContributionOccurrence {
  goalId: string;
  versionId: string;
  occurrenceDate: string;
  date: string;
  amount: number;
  plannedAmount: number;
  contributed: number;
}
/** Shared by forecast, reserve and the goal summary; end is exclusive. */
export function goalContributionOccurrences(
  state: FinanceState,
  goal: Goal,
  start: string,
  end: string,
  today = localDate(),
  options: { legacyDay?: number; amount?: number } = {},
): GoalContributionOccurrence[] {
  const cycles = (state.goalFundCycles ?? []).filter(
    (cycle) => cycle.goalId === goal.id,
  );
  const active = cycles.find((cycle) => cycle.status === "active");
  if (!active && cycles.some((cycle) => cycle.status === "paid")) return [];
  if (active) {
    const afterPayment = shiftDate(active.occurrenceDate, 1);
    if (afterPayment < end) end = afterPayment;
  }
  const legacyDay = options.legacyDay ?? state.settings.forecast?.goalDay ?? 31;
  let remaining = Math.max(0, goal.target - goalSaved(state, goal, today));
  if (!remaining || start >= end) return [];
  const contributed = goalEventContributions(state, goal, today, legacyDay);
  function* candidates() {
    for (const version of [...goalVersions(goal, legacyDay)].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    )) {
      // Preserve the old current-month reserve, including an unpaid day before today.
      const from =
        version.legacy && monthKey(start) === monthKey(today)
          ? `${monthKey(start)}-01`
          : start;
      if ((options.amount ?? version.amount) === 0) continue;
      for (const date of dates(version, from, end)) yield { date, version };
    }
  }
  const result: GoalContributionOccurrence[] = [];
  for (const { date, version } of candidates()) {
    const paid = contributed.get(goalOccurrenceKey(version, date)) ?? 0;
    const plannedAmount = options.amount ?? version.amount;
    const amount = Math.max(0, Math.min(remaining, plannedAmount - paid));
    if (!amount) continue;
    result.push({
      goalId: goal.id,
      versionId: version.id,
      occurrenceDate: date,
      date: date < start ? start : date,
      amount,
      plannedAmount,
      contributed: paid,
    });
    remaining -= amount;
    if (!remaining) break;
  }
  return result;
}
export function goalScheduleSummary(
  state: FinanceState,
  goal: Goal,
  today = localDate(),
  legacyDay = state.settings.forecast?.goalDay ?? 31,
) {
  const remaining = Math.max(0, goal.target - goalSaved(state, goal, today));
  const versions = goalVersions(goal, legacyDay);
  const latest = versions.filter((entry) => !entry.voided).at(-1);
  const activeCycle = state.goalFundCycles?.find(
    (cycle) => cycle.goalId === goal.id && cycle.status === "active",
  );
  const deadline = activeCycle?.occurrenceDate ?? latest?.deadline;
  const end = deadline ? shiftDate(deadline, 1) : "2101-01-01";
  const paid = goalEventContributions(state, goal, today, legacyDay);
  let futureDates = 0;
  if (deadline)
    for (const version of versions)
      for (const date of dates(version, today, end)) {
        if (
          version.amount === 0 ||
          (paid.get(goalOccurrenceKey(version, date)) ?? 0) < version.amount
        )
          futureDates++;
      }
  const occurrences = goalContributionOccurrences(
    state,
    goal,
    today,
    end,
    today,
    { legacyDay },
  );
  const planned = occurrences.reduce((sum, entry) => sum + entry.amount, 0);
  return {
    remaining,
    deadline,
    nextDate: occurrences[0]?.date,
    requiredContribution: deadline
      ? remaining === 0
        ? 0
        : futureDates
          ? Math.ceil(remaining / futureDates)
          : null
      : null,
    remainingDates: deadline ? futureDates : null,
    reachable: remaining === 0 || planned >= remaining,
    estimatedDate:
      remaining === 0
        ? today
        : planned >= remaining
          ? occurrences.at(-1)?.date
          : undefined,
  };
}
export function goalReserve(state: FinanceState, today = localDate()) {
  const end = shiftMonth(`${monthKey(today)}-01`, 1);
  return state.goals.reduce(
    (sum, goal) =>
      sum +
      toBase(
        state,
        goalContributionOccurrences(state, goal, today, end, today).reduce(
          (total, entry) => total + entry.amount,
          0,
        ),
        goal.currency,
      ),
    0,
  );
}

export function goalContributionLinkError(
  state: FinanceState,
  transaction: Transaction,
) {
  if (!transaction.goalVersionId && !transaction.goalOccurrenceDate)
    return undefined;
  const goal = state.goals.find((entry) => entry.id === transaction.goalId);
  if (
    !goal ||
    transaction.type !== "transfer" ||
    !isPosted(transaction) ||
    !transaction.goalVersionId ||
    !transaction.goalOccurrenceDate
  )
    return "Укажите цель, версию и дату для проведённого пополнения.";
  const version = goalVersions(
    goal,
    state.settings.forecast?.goalDay ?? 31,
  ).find((entry) => entry.id === transaction.goalVersionId && !entry.voided);
  const date = transaction.goalOccurrenceDate;
  if (!version || !validDate(date))
    return "Версия или дата взноса цели не найдена.";
  if (version.legacy) {
    // The legacy key is a month; its scheduled day selects the interval.
    const originalDate = dateInMonth(date, version.day ?? 31);
    if (
      originalDate < version.effectiveFrom ||
      (version.effectiveTo && originalDate >= version.effectiveTo)
    )
      return "Дата взноса не соответствует версии цели.";
  } else if (
    date < version.effectiveFrom ||
    (version.effectiveTo && date >= version.effectiveTo) ||
    (version.schedule
      ? !isScheduledDate(version.schedule, date)
      : date !== dateInMonth(date, version.day ?? 31))
  )
    return "Дата взноса не соответствует графику цели.";
  return undefined;
}
export function validateGoalSchedules(state: FinanceState) {
  for (const goal of state.goals) {
    if (!goal.versions) continue;
    if (
      !goal.versions.length ||
      goal.versions.length > 200 ||
      new Set(goal.versions.map((version) => version.id)).size !==
        goal.versions.length
    )
      throw new Error("Некорректная история условий цели.");
    let end = "2000-01-01";
    for (const version of goal.versions) {
      if (
        !version.id ||
        !validDate(version.effectiveFrom) ||
        version.effectiveFrom < "2000-01-01" ||
        version.effectiveFrom > "2100-12-31" ||
        (version.effectiveTo &&
          (!validDate(version.effectiveTo) ||
            version.effectiveTo <= version.effectiveFrom ||
            version.effectiveTo > "2100-12-31")) ||
        !Number.isSafeInteger(version.amount) ||
        version.amount < 0 ||
        version.amount > MAX_MONEY ||
        (version.schedule
          ? version.day !== undefined ||
            !scheduleSchema.safeParse(version.schedule).success
          : !Number.isInteger(version.day) ||
            (version.day ?? 0) < 1 ||
            (version.day ?? 32) > 31) ||
        (version.deadline &&
          (!validDate(version.deadline) ||
            version.deadline < version.effectiveFrom ||
            version.deadline > "2100-12-31"))
      )
        throw new Error("Проверьте сумму, даты и график версии цели.");
      if (
        version.legacy &&
        (version.id !== "legacy" ||
          version.schedule ||
          version !== goal.versions[0])
      )
        throw new Error(
          "Прежние условия цели должны быть первой месячной версией.",
        );
      if (version.voided) continue;
      if (version.effectiveFrom < end)
        throw new Error("Интервалы условий цели пересекаются.");
      end = version.effectiveTo ?? "2101-01-01";
    }
    const latest = goal.versions.filter((version) => !version.voided).at(-1);
    if (!latest) throw new Error("У цели нет действовавших условий.");
    if (latest.amount !== goal.monthly)
      throw new Error(
        "Текущий взнос не совпадает с последними условиями цели.",
      );
  }
  for (const transaction of state.transactions) {
    const error = goalContributionLinkError(state, transaction);
    if (error) throw new Error(error);
  }
}
