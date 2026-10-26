import { accountCurrency, currencyRate, type CurrencyCode } from "../currency";
import { localDate, shiftDate, shiftMonth, uid, validDate } from "../finance";
import { promoteFinanceVersion } from "../financeVersion";
import {
  goalContributionIdentity,
  goalSaved,
  goalTransitionConflicts,
  goalVersions,
  validateGoalSchedules,
} from "../goals";
import { scheduleSchema } from "../recurrence";
import type { FinanceState, Goal, GoalTermsVersion } from "../types";
import type { RecurrenceSchedule } from "../recurrence";
import { saveTransaction } from "./transactions";
import {
  checkAmount,
  checkCurrencyAmounts,
  checkName,
  ensure,
} from "./validation";

export { goalTransitionConflicts } from "../goals";

export type GoalInput = Pick<Goal, "name" | "target" | "monthly" | "icon"> & {
  id?: string;
  currency?: CurrencyCode;
  day?: number;
  schedule?: RecurrenceSchedule;
  deadline?: string;
  effectiveFrom?: string;
};
const validPlanDate = (date: string) =>
  validDate(date) && date >= "2000-01-01" && date <= "2100-12-31";
function inputTerms(
  input: GoalInput,
  legacyDay: number,
): Pick<GoalTermsVersion, "amount" | "day" | "schedule" | "deadline"> {
  return {
    amount: input.monthly,
    ...(input.schedule
      ? { schedule: { ...input.schedule } }
      : { day: input.day ?? legacyDay }),
    ...(input.deadline ? { deadline: input.deadline } : {}),
  };
}
export function goalTermsChanged(goal: Goal, input: GoalInput, legacyDay = 31) {
  const current = goalVersions(goal, legacyDay)
    .filter((entry) => !entry.voided)
    .at(-1)!;
  const next = inputTerms(input, legacyDay);
  return (
    current.amount !== next.amount ||
    current.day !== next.day ||
    current.schedule?.unit !== next.schedule?.unit ||
    current.schedule?.interval !== next.schedule?.interval ||
    current.schedule?.anchor !== next.schedule?.anchor ||
    current.deadline !== next.deadline ||
    (!goal.versions &&
      (input.day !== undefined ||
        input.schedule !== undefined ||
        input.deadline !== undefined))
  );
}
export function saveGoal(
  state: FinanceState,
  input: GoalInput,
  today = localDate(),
): FinanceState {
  const original = state.goals.find((g) => g.id === input.id);
  ensure(!input.id || original, "Цель уже удалена.");
  ensure(
    original || state.goals.length < 100,
    "Можно создать не более 100 целей.",
  );
  const currency = input.currency ?? original?.currency ?? "RUB";
  ensure(
    !original || (original.currency ?? "RUB") === currency,
    "Валюту существующей цели менять нельзя.",
  );
  currencyRate(state, currency);
  checkName(input.name);
  checkAmount(input.target);
  checkAmount(input.monthly, true);
  ensure(
    !original || input.target >= goalSaved(state, original, today),
    "Сумма цели не может быть меньше уже накопленного.",
  );
  const legacyDay = state.settings.forecast?.goalDay ?? 31;
  ensure(
    !input.schedule || scheduleSchema.safeParse(input.schedule).success,
    "Укажите корректную дату и интервал взносов от 1 до 365.",
  );
  ensure(
    input.day === undefined ||
      (Number.isInteger(input.day) && input.day >= 1 && input.day <= 31),
    "Выберите день взноса от 1 до 31.",
  );
  ensure(
    !input.deadline || validPlanDate(input.deadline),
    "Укажите срок цели от 2000 до 2100 года.",
  );
  const hasIndividualTerms =
    input.day !== undefined ||
    input.schedule !== undefined ||
    input.deadline !== undefined;
  const transition = original
    ? goalTermsChanged(original, input, legacyDay)
    : hasIndividualTerms;
  let versions = original?.versions;
  if (transition) {
    const legacyBoundary =
      original && !original.versions ? shiftMonth(today, 1) : undefined;
    const boundary =
      input.effectiveFrom ?? legacyBoundary ?? shiftDate(today, 1);
    ensure(
      !legacyBoundary || boundary === legacyBoundary,
      `Первый индивидуальный график прежней цели начинается с ближайшего нового месяца: ${legacyBoundary}. До этой даты сохраняется прежний месячный взнос.`,
    );
    ensure(
      validPlanDate(boundary) && boundary > today,
      "Новые условия цели могут действовать не раньше завтра.",
    );
    ensure(
      !input.deadline || input.deadline >= boundary,
      "Срок цели должен быть не раньше начала новых условий.",
    );
    const existing = original ? goalVersions(original, legacyDay) : [];
    ensure(
      existing.length < 200,
      "В истории цели уже 200 версий. Создайте отдельную цель.",
    );
    const conflicts = original
      ? goalTransitionConflicts(state, original, boundary)
      : [];
    ensure(
      !conflicts.length,
      `Новые условия затрагивают уже отмеченные взносы: ${conflicts.slice(0, 12).join(", ")}. Выберите дату после ${conflicts.at(-1) ?? boundary}.`,
    );
    versions = [
      ...existing.map((version): GoalTermsVersion =>
        version.voided
          ? version
          : version.effectiveFrom >= boundary
            ? { ...version, voided: true }
            : !version.effectiveTo || version.effectiveTo > boundary
              ? { ...version, effectiveTo: boundary }
              : version,
      ),
      { id: uid(), effectiveFrom: boundary, ...inputTerms(input, legacyDay) },
    ];
  }
  const goal: Goal = {
    ...original,
    id: original?.id ?? uid(),
    name: input.name.trim(),
    target: input.target,
    monthly: input.monthly,
    icon: input.icon,
    currency,
    initialSaved: original?.initialSaved ?? 0,
    color: input.icon === "shield-checkmark-outline" ? "#EFECF7" : "#EAF0E8",
    ...(versions ? { versions } : {}),
  };
  const next: FinanceState = {
    ...state,
    ...(transition ? { version: promoteFinanceVersion(state.version, 7) } : {}),
    goals: original
      ? state.goals.map((g) => (g.id === goal.id ? goal : g))
      : [...state.goals, goal],
  };
  validateGoalSchedules(next);
  checkCurrencyAmounts(next, today);
  return next;
}
export function deleteGoal(state: FinanceState, id: string): FinanceState {
  return {
    ...state,
    ...(state.goalFundCycles
      ? {
          goalFundCycles: state.goalFundCycles.filter(
            (cycle) => cycle.goalId !== id,
          ),
        }
      : {}),
    ...(state.goalReleases
      ? {
          goalReleases: state.goalReleases.filter(
            (release) => release.goalId !== id,
          ),
        }
      : {}),
    goals: state.goals.filter((g) => g.id !== id),
    ...(state.settings.forecast?.goalAccounts
      ? {
          settings: {
            ...state.settings,
            forecast: {
              ...state.settings.forecast,
              goalAccounts: state.settings.forecast.goalAccounts.filter(
                (item) => item.goalId !== id,
              ),
            },
          },
        }
      : {}),
    transactions: state.transactions.map((t) =>
      t.goalId === id
        ? {
            ...t,
            goalId: undefined,
            goalVersionId: undefined,
            goalOccurrenceDate: undefined,
          }
        : t,
    ),
  };
}
export function fundGoal(
  state: FinanceState,
  input: {
    goalId: string;
    amount: number;
    accountId: string;
    toAccountId?: string;
    toAmount?: number;
    goalVersionId?: string;
    goalOccurrenceDate?: string;
  },
  today = localDate(),
): FinanceState {
  const goal = state.goals.find((g) => g.id === input.goalId);
  ensure(goal, "Цель уже удалена.");
  const destination = state.accounts.find(
    (a) =>
      a.kind === "savings" &&
      !a.archived &&
      (a.currency ?? "RUB") === (goal.currency ?? "RUB") &&
      (!input.toAccountId || a.id === input.toAccountId),
  );
  ensure(
    destination,
    `Добавьте накопительный счёт в валюте ${goal.currency ?? "RUB"}.`,
  );
  ensure(
    (input.goalVersionId === undefined) ===
      (input.goalOccurrenceDate === undefined),
    "Выберите версию и дату взноса вместе.",
  );
  const identity =
    input.goalVersionId && input.goalOccurrenceDate
      ? {
          versionId: input.goalVersionId,
          occurrenceDate: input.goalOccurrenceDate,
        }
      : goal.versions
        ? goalContributionIdentity(
            goal,
            today,
            state.settings.forecast?.goalDay ?? 31,
          )
        : undefined;
  const next = saveTransaction(
    state,
    {
      type: "transfer",
      title: goal.name,
      amount: input.amount,
      toAmount: input.toAmount,
      date: today,
      category: "other",
      accountId: input.accountId,
      toAccountId: destination.id,
      goalId: goal.id,
      ...(identity
        ? {
            goalVersionId: identity.versionId,
            goalOccurrenceDate: identity.occurrenceDate,
          }
        : {}),
    },
    today,
  );
  validateGoalSchedules(next);
  return identity
    ? { ...next, version: promoteFinanceVersion(next.version, 7) }
    : next;
}

export type GoalWithdrawalInput = {
  goalId: string;
  amount: number;
  accountId: string;
  toAccountId: string;
  toAmount?: number;
};

/** Release the allocation and record the actual return transfer atomically. */
export function withdrawGoal(
  state: FinanceState,
  input: GoalWithdrawalInput,
  today = localDate(),
): FinanceState {
  const goal = state.goals.find((entry) => entry.id === input.goalId);
  ensure(goal, "Цель уже удалена.");
  checkAmount(input.amount);
  ensure(
    input.amount <= goalSaved(state, goal, today),
    "Нельзя вывести больше, чем накоплено в цели.",
  );
  const source = state.accounts.find((entry) => entry.id === input.accountId);
  const destination = state.accounts.find(
    (entry) => entry.id === input.toAccountId,
  );
  ensure(
    source?.kind === "savings" &&
      !source.archived &&
      accountCurrency(state, source.id) === (goal.currency ?? "RUB"),
    "Выберите активный накопительный счёт в валюте цели.",
  );
  ensure(
    destination?.kind === "spending" && !destination.archived,
    "Выберите активный повседневный счёт для зачисления.",
  );
  ensure(
    (state.goalReleases?.length ?? 0) < 500,
    "В учёте уже 500 возвратов из целей.",
  );
  const transferId = uid();
  return saveTransaction(
    {
      ...state,
      version: promoteFinanceVersion(state.version, 9),
      goalReleases: [
        ...(state.goalReleases ?? []),
        {
          id: uid(),
          goalId: goal.id,
          amount: input.amount,
          date: today,
          transferId,
        },
      ],
    },
    {
      createId: transferId,
      type: "transfer",
      title: `Из цели: ${goal.name}`.slice(0, 120),
      amount: input.amount,
      toAmount: input.toAmount,
      accountId: source.id,
      toAccountId: destination.id,
      date: today,
      category: "other",
    },
    today,
  );
}
