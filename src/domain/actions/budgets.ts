import {
  budgetPeriod,
  budgetPlanSchema,
  categoryBudget,
  budgetTermsAt,
  validateBudgetPlans,
  type BudgetPlan,
  type BudgetTerms,
  type BudgetVersion,
} from "../budgets";
import { localDate, shiftDate, validDate } from "../../shared/lib/dates";
import type { FinanceState } from "../types";
import { checkAmount, ensure } from "./validation";

export type BudgetPlanInput = Omit<BudgetTerms, "changes" | "overrides"> & {
  categoryId: string;
  date: string;
  amount: number;
  onlyThisPeriod: boolean;
};
export function saveBudgetPlan(
  state: FinanceState,
  input: BudgetPlanInput,
  today = localDate(),
): FinanceState {
  const category = state.categories.find(
    (entry) =>
      entry.id === input.categoryId && !entry.parentId && !entry.archived,
  );
  ensure(category, "Выберите активную основную категорию.");
  checkAmount(input.amount, true);
  ensure(
    validDate(input.date) &&
      input.date >= "2000-01-01" &&
      input.date <= "2100-12-31",
    "Укажите корректную дату бюджетного периода.",
  );
  const original = state.budgetPlans?.find(
    (entry) => entry.categoryId === input.categoryId,
  );
  const originalTerms = original && budgetTermsAt(original, input.date);
  if (original)
    for (const key of [
      "period",
      "startDay",
      "anchor",
      "rolloverSurplus",
      "rolloverDeficit",
    ] as const)
      ensure(
        input[key] === originalTerms![key],
        "График и переносы сохранены для истории бюджета. Меняйте суммы будущих периодов.",
      );
  const plan: BudgetTerms = originalTerms ?? {
    period: input.period,
    startDay: input.startDay,
    anchor: input.anchor,
    rolloverSurplus: input.rolloverSurplus,
    rolloverDeficit: input.rolloverDeficit,
    changes: [{ from: "2000-01-01", amount: category.budget }],
    overrides: [],
  };
  ensure(
    budgetPlanSchema.safeParse({ ...plan, categoryId: input.categoryId })
      .success,
    "Проверьте начало периода, день месяца и правила бюджета.",
  );
  const start = budgetPeriod(plan, input.date).start;
  ensure(
    start >= budgetPeriod(original ?? plan, today).start &&
      start >= plan.anchor,
    "Закрытый период сохраняется. Выберите текущий или будущий период.",
  );
  ensure(
    original || (plan.anchor >= shiftDate(today, -366) && plan.anchor <= today),
    "Начало нового графика должно быть не позднее сегодня и не старше года.",
  );
  ensure(
    original || budgetPeriod(plan, today).start === plan.anchor,
    "Начните новый график с текущего периода: прошлые недели или годы не должны создавать перенос задним числом.",
  );
  const nextTerms: BudgetTerms = {
    ...plan,
    changes: input.onlyThisPeriod
      ? plan.changes
      : [
          ...plan.changes.filter((entry) => entry.from !== start),
          { from: start, amount: input.amount },
        ].sort((a, b) => a.from.localeCompare(b.from)),
    overrides: input.onlyThisPeriod
      ? [
          ...plan.overrides.filter((entry) => entry.start !== start),
          { start, amount: input.amount },
        ]
      : plan.overrides.filter((entry) => entry.start !== start),
  };
  const nextPlan: BudgetPlan =
    original && originalTerms !== original
      ? {
          ...original,
          versions: original.versions!.map((version) =>
            version === originalTerms ? { ...version, ...nextTerms } : version,
          ),
        }
      : { ...original, ...nextTerms, categoryId: input.categoryId };
  const next = {
    ...state,
    budgetPlans: [
      ...(state.budgetPlans ?? []).filter(
        (entry) => entry.categoryId !== input.categoryId,
      ),
      nextPlan,
    ],
  };
  validateBudgetPlans(next);
  const calculated = categoryBudget(next, input.categoryId, input.date, today);
  ensure(
    Number.isSafeInteger(calculated.budget) &&
      Number.isSafeInteger(calculated.carried),
    "Сумма бюджета превышает допустимый размер.",
  );
  return next;
}

export interface BudgetTransitionInput {
  categoryId: string;
  period: BudgetTerms["period"];
  amount: number;
  rolloverSurplus: boolean;
  rolloverDeficit: boolean;
  /** The boundary shown in the confirmation; rejected if the current day changed it. */
  expectedStart?: string;
}

export function scheduleBudgetTransition(
  state: FinanceState,
  input: BudgetTransitionInput,
  today = localDate(),
): FinanceState {
  const category = state.categories.find(
    (entry) =>
      entry.id === input.categoryId && !entry.parentId && !entry.archived,
  );
  ensure(category, "Выберите активную основную категорию.");
  checkAmount(input.amount, true);
  const original = state.budgetPlans?.find(
    (entry) => entry.categoryId === input.categoryId,
  );
  ensure(original, "Сначала сохраните первый график бюджета.");
  ensure(
    !original.versions?.some((entry) => entry.effectiveFrom > today),
    "Новый график уже запланирован. Дождитесь его начала, прежде чем назначать следующий.",
  );
  const start = budgetPeriod(original, today).end;
  ensure(
    validDate(start) && start > today && start <= "2100-12-31",
    "Следующая граница бюджета выходит за поддерживаемый календарь до 2100 года.",
  );
  ensure(
    input.expectedStart === undefined || input.expectedStart === start,
    "Граница периода изменилась. Проверьте новый расчёт и подтвердите переход снова.",
  );
  const current = budgetTermsAt(original, today);
  const conflicts = [
    ...current.changes
      .filter((entry) => entry.from >= start)
      .map((entry) => entry.from),
    ...current.overrides
      .filter((entry) => entry.start >= start)
      .map((entry) => entry.start),
  ];
  ensure(
    !conflicts.length,
    `В будущем уже заданы лимиты: ${[...new Set(conflicts)].sort().join(", ")}. Переход не изменён: дождитесь этих периодов.`,
  );
  const version: BudgetVersion = {
    id: `budget-${start}`,
    effectiveFrom: start,
    anchor: start,
    startDay: Number(start.slice(-2)),
    period: input.period,
    rolloverSurplus: input.rolloverSurplus,
    rolloverDeficit: input.rolloverDeficit,
    changes: [{ from: start, amount: input.amount }],
    overrides: [],
  };
  const next: FinanceState = {
    ...state,
    version: state.version >= 6 ? state.version : 6,
    budgetPlans: state.budgetPlans!.map((entry) =>
      entry === original
        ? { ...entry, versions: [...(entry.versions ?? []), version] }
        : entry,
    ),
  };
  validateBudgetPlans(next);
  categoryBudget(next, input.categoryId, start, today);
  return next;
}

export function previewBudgetTransition(
  state: FinanceState,
  input: BudgetTransitionInput,
  today = localDate(),
) {
  const next = scheduleBudgetTransition(state, input, today);
  const plan = next.budgetPlans!.find(
    (entry) => entry.categoryId === input.categoryId,
  )!;
  const start = plan.versions!.at(-1)!.effectiveFrom;
  return {
    start,
    before: categoryBudget(state, input.categoryId, today, today),
    after: categoryBudget(next, input.categoryId, start, today),
    next,
  };
}
