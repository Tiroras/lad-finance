import {
  budgetPeriod,
  budgetPlanSchema,
  categoryBudget,
  validateBudgetPlans,
  type BudgetPlan,
} from "../budgets";
import { localDate, shiftDate, validDate } from "../../shared/lib/dates";
import type { FinanceState } from "../types";
import { checkAmount, ensure } from "./validation";

export type BudgetPlanInput = Omit<BudgetPlan, "changes" | "overrides"> & {
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
  if (original)
    for (const key of [
      "period",
      "startDay",
      "anchor",
      "rolloverSurplus",
      "rolloverDeficit",
    ] as const)
      ensure(
        input[key] === original[key],
        "График и переносы сохранены для истории бюджета. Меняйте суммы будущих периодов.",
      );
  const plan: BudgetPlan = original ?? {
    categoryId: input.categoryId,
    period: input.period,
    startDay: input.startDay,
    anchor: input.anchor,
    rolloverSurplus: input.rolloverSurplus,
    rolloverDeficit: input.rolloverDeficit,
    changes: [{ from: "2000-01-01", amount: category.budget }],
    overrides: [],
  };
  ensure(
    budgetPlanSchema.safeParse(plan).success,
    "Проверьте начало периода, день месяца и правила бюджета.",
  );
  const start = budgetPeriod(plan, input.date).start;
  ensure(
    start >= budgetPeriod(plan, today).start && start >= plan.anchor,
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
  const nextPlan: BudgetPlan = {
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
