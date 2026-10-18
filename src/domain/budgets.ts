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
import type { Category, FinanceState } from "./types";

export interface BudgetTerms {
  period: "monthly" | "weekly" | "yearly";
  startDay: number;
  anchor: string;
  rolloverSurplus: boolean;
  rolloverDeficit: boolean;
  changes: { from: string; amount: number }[];
  overrides: { start: string; amount: number }[];
}
export interface BudgetVersion extends BudgetTerms {
  id: string;
  effectiveFrom: string;
}
export interface BudgetPlan extends BudgetTerms {
  categoryId: string;
  /** Later conditions only; the top-level terms remain the original history. */
  versions?: BudgetVersion[];
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

export const budgetVersionSchema = budgetPlanSchema
  .omit({ categoryId: true })
  .extend({ id: z.string().min(1).max(100), effectiveFrom: date });
export const budgetPlanSchemaV6 = budgetPlanSchema.extend({
  versions: z.array(budgetVersionSchema).min(1).max(200).optional(),
});

export function budgetTermsAt(plan: BudgetPlan, date: string): BudgetTerms {
  return (
    plan.versions?.filter((entry) => entry.effectiveFrom <= date).at(-1) ?? plan
  );
}

export function budgetHistory(plan: BudgetPlan): BudgetVersion[] {
  const { categoryId: _categoryId, versions: _versions, ...original } = plan;
  return [
    { ...original, id: "legacy", effectiveFrom: plan.anchor },
    ...(plan.versions ?? []),
  ];
}

export function budgetPeriod(
  plan:
    | (Pick<BudgetPlan, "period" | "startDay" | "anchor"> &
        Partial<Pick<BudgetPlan, "versions">>)
    | undefined,
  date: string,
) {
  const version = plan?.versions
    ?.filter((entry) => entry.effectiveFrom <= date)
    .at(-1);
  return termsPeriod(version ?? plan, date);
}

function termsPeriod(
  plan: Pick<BudgetTerms, "period" | "startDay" | "anchor"> | undefined,
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
  const terms = budgetTermsAt(plan, start);
  return (
    terms.overrides.find((entry) => entry.start === start)?.amount ??
    terms.changes.filter((entry) => entry.from <= start).at(-1)?.amount ??
    fallback
  );
}

interface DatedExpense {
  date: string;
  amount: number;
}

export interface BudgetActivityTransaction {
  transactionId: string;
  title: string;
  date: string;
  /** The contribution to this budget, in historical base-currency minor units. */
  amount: number;
  /** The whole purchase or refund in the same historical base currency. */
  totalAmount: number;
  refund: boolean;
}

/** Exact operations behind the selected budget period; reading never changes it. */
export function budgetActivity(
  state: FinanceState,
  categoryId: string,
  date: string,
  today: string,
) {
  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category || category.parentId)
    throw new Error("Выберите основную категорию бюджета.");
  const period = budgetPeriod(
    state.budgetPlans?.find((entry) => entry.categoryId === categoryId),
    date,
  );
  const roots = new Map(
    state.categories.map((entry) => [entry.id, entry.parentId ?? entry.id]),
  );
  const transactions: BudgetActivityTransaction[] = [];
  for (const transaction of state.transactions) {
    if (
      transaction.date < period.start ||
      transaction.date >= period.end ||
      transaction.date > today
    )
      continue;
    // Keep the complete state: a refund may refer to a purchase in an older period.
    const parts = expenseContributions(state, transaction).filter(
      (entry) => roots.get(entry.category) === categoryId,
    );
    if (!parts.length) continue;
    transactions.push({
      transactionId: transaction.id,
      title: transaction.title,
      date: transaction.date,
      amount: parts.reduce((sum, entry) => sum + entry.amount, 0),
      totalAmount: transactionValue(state, transaction),
      refund: !!transaction.refundOf,
    });
  }
  transactions.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.transactionId.localeCompare(b.transactionId),
  );
  return {
    ...period,
    spent: transactions.reduce((sum, entry) => sum + entry.amount, 0),
    transactions,
  };
}

function spendingByCategory(state: FinanceState, today: string) {
  const roots = new Map(
    state.categories.map((entry) => [entry.id, entry.parentId ?? entry.id]),
  );
  const spending = new Map<string, DatedExpense[]>();
  for (const transaction of state.transactions) {
    if (transaction.date > today) continue;
    for (const entry of expenseContributions(state, transaction)) {
      const root = roots.get(entry.category);
      if (!root) continue;
      const expenses = spending.get(root) ?? [];
      expenses.push({ date: transaction.date, amount: entry.amount });
      spending.set(root, expenses);
    }
  }
  return spending;
}

function calculateCategoryBudget(
  category: Category,
  plan: BudgetPlan | undefined,
  date: string,
  expenses: DatedExpense[],
) {
  const period = budgetPeriod(plan, date);
  const spending = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.date >= period.end) continue;
    const key = budgetPeriod(plan, expense.date).start;
    spending.set(key, (spending.get(key) ?? 0) + expense.amount);
  }
  let carried = 0;
  if (
    plan &&
    budgetHistory(plan).some(
      (terms) => terms.rolloverSurplus || terms.rolloverDeficit,
    ) &&
    period.start > plan.anchor
  )
    for (
      let start = plan.anchor, count = 0;
      start < period.start;
      start = budgetPeriod(plan, start).end
    ) {
      if (++count > 5400)
        throw new Error("Период бюджета превышает поддерживаемые 100 лет.");
      const terms = budgetTermsAt(plan, start);
      const left =
        periodLimit(plan, start, category.budget) +
        carried -
        (spending.get(start) ?? 0);
      carried =
        left >= 0
          ? terms.rolloverSurplus
            ? left
            : 0
          : terms.rolloverDeficit
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
    hasActivity: expenses.some(
      (expense) => expense.date >= period.start && expense.date < period.end,
    ),
  };
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
  return calculateCategoryBudget(
    category,
    state.budgetPlans?.find((entry) => entry.categoryId === id),
    date,
    spendingByCategory(state, today).get(id) ?? [],
  );
}

export function categoryBudgets(
  state: FinanceState,
  date = localDate(),
  today = localDate(),
) {
  const spending = spendingByCategory(state, today);
  const plans = new Map(
    (state.budgetPlans ?? []).map((plan) => [plan.categoryId, plan]),
  );
  return state.categories
    .filter((category) => !category.parentId)
    .map((category) => ({
      ...category,
      ...calculateCategoryBudget(
        category,
        plans.get(category.id),
        date,
        spending.get(category.id) ?? [],
      ),
    }));
}

export function validateBudgetPlans(state: FinanceState) {
  const plans = state.budgetPlans ?? [];
  if (new Set(plans.map((p) => p.categoryId)).size !== plans.length)
    throw new Error("Повторяющиеся планы бюджета категории.");
  for (const plan of plans) {
    if (
      !budgetPlanSchemaV6.safeParse(plan).success ||
      !state.categories.some(
        (category) => category.id === plan.categoryId && !category.parentId,
      )
    )
      throw new Error("Некорректный план бюджета категории.");
    if (plan.versions && state.version !== 6)
      throw new Error(
        "История условий бюджета требует финансовый формат версии 6.",
      );
    const history = budgetHistory(plan);
    if (new Set(history.map((entry) => entry.id)).size !== history.length)
      throw new Error("Повторяющиеся версии бюджета.");
    for (let index = 0; index < history.length; index++) {
      const terms = history[index];
      const nextStart = history[index + 1]?.effectiveFrom;
      const previous = history[index - 1];
      if (
        termsPeriod(terms, terms.anchor).start !== terms.anchor ||
        terms.effectiveFrom !== terms.anchor ||
        terms.changes[0].from !== (index ? terms.anchor : "2000-01-01") ||
        (previous &&
          (terms.effectiveFrom <= previous.effectiveFrom ||
            termsPeriod(previous, shiftDate(terms.effectiveFrom, -1)).end !==
              terms.effectiveFrom))
      )
        throw new Error("Некорректная граница условий бюджета.");
      if (
        terms.changes.some(
          (entry, changeIndex) =>
            (changeIndex > 0 &&
              (entry.from <= terms.changes[changeIndex - 1].from ||
                entry.from < terms.anchor ||
                termsPeriod(terms, entry.from).start !== entry.from)) ||
            !!(nextStart && entry.from >= nextStart),
        )
      )
        throw new Error("Некорректная история лимитов бюджета.");
      if (
        new Set(terms.overrides.map((entry) => entry.start)).size !==
          terms.overrides.length ||
        terms.overrides.some(
          (entry) =>
            entry.start < terms.anchor ||
            termsPeriod(terms, entry.start).start !== entry.start ||
            !!(nextStart && entry.start >= nextStart),
        )
      )
        throw new Error("Некорректный лимит отдельного периода.");
    }
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
    // Preserve the accepted legacy bound for snapshots without any transition.
    if (!plan?.versions) {
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
      continue;
    }
    const history = plan ? budgetHistory(plan) : [];
    if (!history.length) {
      magnitude += BigInt(category.budget);
      continue;
    }
    for (let index = 0; index < history.length; index++) {
      const terms = history[index];
      const end = history[index + 1]?.effectiveFrom ?? "2101-01-01";
      const maximum = Math.max(
        category.budget,
        ...terms.changes.map((entry) => entry.amount),
        ...terms.overrides.map((entry) => entry.amount),
      );
      const periods = !terms.rolloverSurplus
        ? 1
        : terms.period === "weekly"
          ? Math.ceil(daysBetween(terms.anchor, end) / 7)
          : terms.period === "yearly"
            ? Number(end.slice(0, 4)) - Number(terms.anchor.slice(0, 4)) + 1
            : (Number(end.slice(0, 4)) - Number(terms.anchor.slice(0, 4))) *
                12 +
              Number(end.slice(5, 7)) -
              Number(terms.anchor.slice(5, 7)) +
              1;
      magnitude += BigInt(maximum) * BigInt(Math.max(1, periods));
    }
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
