import { z } from "zod";
import {
  dateInMonth,
  daysBetween,
  localDate,
  monthKey,
  shiftDate,
  shiftMonth,
  validDate,
} from "../shared/lib/dates";
import { MAX_MONEY, transactionValue } from "./currency";
import { expenseContributions } from "./transactionAmounts";
import type { FinanceState } from "./types";

export interface BudgetPlan {
  categoryId: string;
  period: "monthly" | "weekly" | "yearly";
  startDay: number;
  anchor: string;
  rolloverSurplus: boolean;
  rolloverDeficit: boolean;
  changes: { from: string; amount: number }[];
  overrides: { start: string; amount: number }[];
}
const date = z
  .string()
  .refine((d) => validDate(d) && d >= "2000-01-01" && d <= "2100-12-31");
const amount = z.number().int().min(0).max(MAX_MONEY);
export const budgetPlanSchema = z.object({
  categoryId: z.string().min(1).max(100),
  period: z.enum(["monthly", "weekly", "yearly"]),
  startDay: z.number().int().min(1).max(31),
  anchor: date,
  rolloverSurplus: z.boolean(),
  rolloverDeficit: z.boolean(),
  changes: z
    .array(z.object({ from: date, amount }))
    .min(1)
    .max(1500),
  overrides: z.array(z.object({ start: date, amount })).max(6000),
});

export function budgetPeriod(
  plan: Pick<BudgetPlan, "period" | "startDay" | "anchor"> | undefined,
  date: string,
) {
  if (!plan || date < plan.anchor) {
    const start = `${monthKey(date)}-01`;
    const end = shiftMonth(start, 1);
    // A new schedule can begin in the middle of the old calendar month.
    return { start, end: plan && plan.anchor < end ? plan.anchor : end };
  }
  if (plan.period === "weekly") {
    const start = shiftDate(
      plan.anchor,
      Math.floor(daysBetween(plan.anchor, date) / 7) * 7,
    );
    return { start, end: shiftDate(start, 7) };
  }
  if (plan.period === "yearly") {
    let start = dateInMonth(
      `${date.slice(0, 4)}-${plan.anchor.slice(5, 7)}`,
      Number(plan.anchor.slice(-2)),
    );
    if (start > date)
      start = dateInMonth(
        shiftMonth(start, -12),
        Number(plan.anchor.slice(-2)),
      );
    return {
      start,
      end: dateInMonth(shiftMonth(start, 12), Number(plan.anchor.slice(-2))),
    };
  }
  let start = dateInMonth(date, plan.startDay);
  if (start > date) start = dateInMonth(shiftMonth(date, -1), plan.startDay);
  return { start, end: dateInMonth(shiftMonth(start, 1), plan.startDay) };
}

function periodLimit(
  plan: BudgetPlan | undefined,
  start: string,
  fallback: number,
) {
  if (!plan) return fallback;
  return (
    plan.overrides.find((entry) => entry.start === start)?.amount ??
    plan.changes.filter((entry) => entry.from <= start).at(-1)?.amount ??
    fallback
  );
}

export function categoryBudget(
  state: FinanceState,
  id: string,
  date = localDate(),
  today = localDate(),
) {
  const category = state.categories.find((entry) => entry.id === id);
  if (!category || category.parentId)
    throw new Error("Выберите основную категорию бюджета.");
  const plan = state.budgetPlans?.find((entry) => entry.categoryId === id);
  const period = budgetPeriod(plan, date);
  const roots = new Map(
    state.categories.map((entry) => [entry.id, entry.parentId ?? entry.id]),
  );
  const spending = new Map<string, number>();
  for (const transaction of state.transactions) {
    if (transaction.date > today || transaction.date >= period.end) continue;
    const key = budgetPeriod(plan, transaction.date).start;
    for (const entry of expenseContributions(state, transaction))
      if (roots.get(entry.category) === id)
        spending.set(key, (spending.get(key) ?? 0) + entry.amount);
  }
  let carried = 0;
  if (
    plan &&
    (plan.rolloverSurplus || plan.rolloverDeficit) &&
    period.start > plan.anchor
  )
    for (
      let start = plan.anchor, count = 0;
      start < period.start;
      start = budgetPeriod(plan, start).end
    ) {
      if (++count > 5300)
        throw new Error("Период бюджета превышает поддерживаемые 100 лет.");
      const left =
        periodLimit(plan, start, category.budget) +
        carried -
        (spending.get(start) ?? 0);
      carried =
        left >= 0
          ? plan.rolloverSurplus
            ? left
            : 0
          : plan.rolloverDeficit
            ? left
            : 0;
      if (!Number.isSafeInteger(carried))
        throw new Error("Сумма переноса бюджета превышает точность расчёта.");
    }
  const base = periodLimit(plan, period.start, category.budget);
  if (!Number.isSafeInteger(base + carried))
    throw new Error("Сумма бюджета превышает точность расчёта.");
  return {
    ...period,
    base,
    carried,
    budget: category.archived ? 0 : Math.max(0, base + carried),
    spent: spending.get(period.start) ?? 0,
  };
}

export function categoryBudgets(
  state: FinanceState,
  date = localDate(),
  today = localDate(),
) {
  return state.categories
    .filter((category) => !category.parentId)
    .map((category) => ({
      ...category,
      ...categoryBudget(state, category.id, date, today),
    }));
}

export function validateBudgetPlans(state: FinanceState) {
  const plans = state.budgetPlans ?? [];
  if (new Set(plans.map((p) => p.categoryId)).size !== plans.length)
    throw new Error("Повторяющиеся планы бюджета категории.");
  for (const plan of plans) {
    if (
      !budgetPlanSchema.safeParse(plan).success ||
      !state.categories.some(
        (category) => category.id === plan.categoryId && !category.parentId,
      )
    )
      throw new Error("Некорректный план бюджета категории.");
    if (
      budgetPeriod(plan, plan.anchor).start !== plan.anchor ||
      plan.changes[0].from !== "2000-01-01"
    )
      throw new Error("Некорректная исходная дата бюджета.");
    if (
      plan.changes.some(
        (entry, index) =>
          index > 0 &&
          (entry.from <= plan.changes[index - 1].from ||
            entry.from < plan.anchor ||
            budgetPeriod(plan, entry.from).start !== entry.from),
      )
    )
      throw new Error("Некорректная история лимитов бюджета.");
    if (
      new Set(plan.overrides.map((entry) => entry.start)).size !==
        plan.overrides.length ||
      plan.overrides.some(
        (entry) =>
          entry.start < plan.anchor ||
          budgetPeriod(plan, entry.start).start !== entry.start,
      )
    )
      throw new Error("Некорректный лимит отдельного периода.");
  }
  validateBudgetCapacity(state);
}

// A conservative integer bound covers every remaining period in the supported
// calendar, including carry and the displayed budget-minus-spending difference.
// It avoids recalculating all categories for every transaction or exchange edit.
export function validateBudgetCapacity(state: FinanceState) {
  const plans = new Map(
    (state.budgetPlans ?? []).map((plan) => [plan.categoryId, plan]),
  );
  let magnitude = 0n;
  for (const category of state.categories.filter((entry) => !entry.parentId)) {
    const plan = plans.get(category.id);
    const maximum = Math.max(
      category.budget,
      ...(plan?.changes.map((entry) => entry.amount) ?? []),
      ...(plan?.overrides.map((entry) => entry.amount) ?? []),
    );
    const periods = !plan?.rolloverSurplus
      ? 1
      : plan.period === "weekly"
        ? Math.ceil(daysBetween(plan.anchor, "2101-01-01") / 7)
        : plan.period === "yearly"
          ? 2101 - Number(plan.anchor.slice(0, 4))
          : (2101 - Number(plan.anchor.slice(0, 4))) * 12 -
            Number(plan.anchor.slice(5, 7)) +
            1;
    magnitude += BigInt(maximum) * BigInt(Math.max(1, periods));
  }
  for (const transaction of state.transactions) {
    if (transaction.type !== "expense" && !transaction.refundOf) continue;
    magnitude += 2n * BigInt(Math.abs(transactionValue(state, transaction)));
  }
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(
      "Совокупные лимиты и переносы бюджета слишком велики для точного расчёта. Уменьшите лимиты или отключите перенос в новом графике.",
    );
}
