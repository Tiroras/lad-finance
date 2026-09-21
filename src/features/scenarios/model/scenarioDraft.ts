import { baseCurrency } from "../../../domain/currency";
import { moneyInput, parseMoney } from "../../../domain/finance";
import {
  scenarioChangeCurrency,
  scenarioSchema,
  validateScenarioCurrencies,
} from "../../../domain/scenarios";
import type {
  FinanceState,
  SavedScenario,
  ScenarioChange,
  ScenarioEvent,
} from "../../../domain/types";

export interface ScenarioDraft {
  name: string;
  horizon: 30 | 60 | 90;
  dailySpending?: string;
  changes: (Omit<ScenarioChange, "amount" | "delayDays"> & {
    amount: string;
    delayDays: string;
  })[];
  events: (Omit<ScenarioEvent, "amount"> & { amount: string })[];
}
export function scenarioDraft(
  scenario?: SavedScenario,
  state?: FinanceState,
): ScenarioDraft {
  return {
    name: scenario?.name ?? "Новый вариант",
    horizon: scenario?.horizon ?? 30,
    dailySpending:
      scenario?.dailySpending === undefined
        ? undefined
        : moneyInput(
            scenario.dailySpending,
            state ? baseCurrency(state) : "RUB",
          ),
    changes:
      scenario?.changes.map((c) => ({
        ...c,
        amount: moneyInput(
          c.amount,
          state ? scenarioChangeCurrency(state, c) : (c.currency ?? "RUB"),
        ),
        delayDays: String(c.delayDays),
      })) ?? [],
    events:
      scenario?.events.map((e) => ({
        ...e,
        amount: moneyInput(e.amount, state ? baseCurrency(state) : "RUB"),
      })) ?? [],
  };
}
export function parseScenarioDraft(
  draft: ScenarioDraft,
  id = "preview",
  state?: FinanceState,
): SavedScenario {
  const result = scenarioSchema.safeParse({
    ...draft,
    id,
    dailySpending:
      draft.dailySpending === undefined
        ? undefined
        : parseMoney(draft.dailySpending, state ? baseCurrency(state) : "RUB"),
    changes: draft.changes.map((c) => ({
      ...c,
      currency: state ? scenarioChangeCurrency(state, c) : c.currency,
      amount: parseMoney(
        c.amount,
        state ? scenarioChangeCurrency(state, c) : (c.currency ?? "RUB"),
      ),
      delayDays: /^-?\d+$/.test(c.delayDays) ? Number(c.delayDays) : NaN,
    })),
    events: draft.events.map((e) => ({
      ...e,
      amount: parseMoney(e.amount, state ? baseCurrency(state) : "RUB"),
    })),
  });
  if (!result.success)
    throw new Error(
      "Проверьте название, суммы и даты. Сдвиг дохода — целое число от −90 до 90 дней; отрицательное число означает раньше.",
    );
  if (state) validateScenarioCurrencies(state, result.data);
  return result.data;
}
