import { z } from "zod";
import { accountCurrency, toBase, type CurrencyCode } from "./currency";
import { currencySchema } from "./currencySchema";
import { MAX_MONEY, validDate } from "./finance";
import type { FinanceState, SavedScenario } from "./types";

const amount = z.number().int().min(0).max(MAX_MONEY);
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
export const scenarioSchema = z
  .object({
    id,
    name,
    horizon: z.union([z.literal(30), z.literal(60), z.literal(90)]),
    dailySpending: amount.optional(),
    changes: z
      .array(
        z
          .object({
            source: z.enum(["income", "payment", "goal"]),
            sourceId: id,
            currency: currencySchema.optional(),
            name,
            amount,
            delayDays: z.number().int().min(-90).max(90),
          })
          .refine((c) => c.source === "income" || c.delayDays === 0),
      )
      .max(500),
    events: z
      .array(
        z.object({
          id,
          name,
          type: z.enum(["income", "expense"]),
          amount: amount.min(1),
          date: z
            .string()
            .refine(
              (d) => validDate(d) && d >= "2000-01-01" && d <= "2100-12-31",
            ),
        }),
      )
      .max(100),
  })
  .refine(
    (s) =>
      new Set(s.changes.map((c) => `${c.source}:${c.sourceId}`)).size ===
        s.changes.length &&
      new Set(s.events.map((e) => e.id)).size === s.events.length,
  );

// Removed sources remain visible in a saved experiment; they never recreate real plans.
export function scenarioWarnings(
  state: FinanceState,
  scenario: SavedScenario,
  today: string,
) {
  const warnings: string[] = [];
  for (const c of scenario.changes) {
    const source =
      c.source === "income"
        ? (state.plannedIncomes ?? [])
        : c.source === "payment"
          ? state.recurring
          : state.goals;
    if (!source.some((s) => s.id === c.sourceId))
      warnings.push(
        `«${c.name}» удалён из плана: изменение не участвует в расчёте.`,
      );
    else if (
      c.source === "payment" &&
      !state.recurring.find((p) => p.id === c.sourceId)?.active
    )
      warnings.push(
        `«${c.name}» отключён в плане: изменение не участвует в расчёте.`,
      );
  }
  for (const event of scenario.events)
    if (event.date < today)
      warnings.push(
        `«${event.name}»: дата уже прошла. Обновите её для нового расчёта.`,
      );
  return warnings;
}

export function scenarioChangeCurrency(
  state: FinanceState,
  change: {
    source: "income" | "payment" | "goal";
    sourceId: string;
    currency?: CurrencyCode;
  },
): CurrencyCode {
  if (change.source === "goal")
    return (
      state.goals.find((g) => g.id === change.sourceId)?.currency ??
      change.currency ??
      "RUB"
    );
  const source =
    change.source === "income" ? state.plannedIncomes : state.recurring;
  const plan = source?.find((p) => p.id === change.sourceId);
  return plan
    ? accountCurrency(state, plan.accountId)
    : (change.currency ?? "RUB");
}

export function validateScenarioCurrencies(
  state: FinanceState,
  scenario: SavedScenario,
) {
  for (const change of scenario.changes) {
    const sources =
      change.source === "goal"
        ? state.goals
        : change.source === "payment"
          ? state.recurring
          : (state.plannedIncomes ?? []);
    if (!sources.some((source) => source.id === change.sourceId)) continue;
    const value = toBase(
      state,
      change.amount,
      scenarioChangeCurrency(state, change),
    );
    if (value < 0 || value > MAX_MONEY)
      throw new Error(
        `Сумма «${change.name}» в основной валюте превышает допустимый лимит.`,
      );
  }
}
