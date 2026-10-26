import { budgetTermsAt } from "../budgets";
import { localDate } from "../finance";
import { promoteFinanceVersion } from "../financeVersion";
import { DEFAULT_REMINDERS } from "../reminders";
import { createInitialState } from "../seed";
import { decodeBackup, encodeBackup } from "../backup";
import type {
  FinanceState,
  ForecastPreferences,
  ReminderPreferences,
} from "../types";
import { checkAmount, checkDay, ensure } from "./validation";
import { saveBudgetPlan } from "./budgets";
import {
  hasAccountForecast,
  validateAccountForecast,
} from "../accountForecastSettings";

export function saveSettings(
  state: FinanceState,
  input: Pick<
    FinanceState["settings"],
    "name" | "payday" | "buffer" | "spendableIncomeId"
  >,
): FinanceState {
  ensure(
    input.name.trim().length <= 40,
    "Имя должно быть не длиннее 40 символов.",
  );
  checkDay(input.payday);
  checkAmount(input.buffer, true);
  ensure(
    !input.spendableIncomeId ||
      state.plannedIncomes?.some((p) => p.id === input.spendableIncomeId),
    "Выбранный доход отсутствует в плане.",
  );
  return {
    ...state,
    settings: { ...state.settings, ...input, name: input.name.trim() },
  };
}
export function saveBudget(
  state: FinanceState,
  id: string,
  budget: number,
  today = localDate(),
): FinanceState {
  checkAmount(budget, true);
  ensure(
    state.categories.some((c) => c.id === id && !c.parentId && !c.archived),
    "Категория недоступна для отдельного бюджета. Выберите активную основную категорию.",
  );
  const plan = state.budgetPlans?.find((item) => item.categoryId === id);
  if (plan)
    return saveBudgetPlan(
      state,
      {
        ...budgetTermsAt(plan, today),
        categoryId: id,
        date: today,
        amount: budget,
        onlyThisPeriod: false,
      },
      today,
    );
  return {
    ...state,
    categories: state.categories.map((c) =>
      c.id === id ? { ...c, budget } : c,
    ),
  };
}
export function saveForecastPreferences(
  state: FinanceState,
  preferences: ForecastPreferences,
): FinanceState {
  checkAmount(preferences.dailySpending, true);
  checkDay(preferences.goalDay);
  validateAccountForecast(state, preferences);
  return {
    ...state,
    version: hasAccountForecast(preferences)
      ? promoteFinanceVersion(state.version, 8)
      : state.version,
    settings: { ...state.settings, forecast: preferences },
  };
}
export function saveReminderPreferences(
  state: FinanceState,
  patch: Partial<ReminderPreferences>,
): FinanceState {
  const reminders = {
    ...(state.settings.reminders ?? DEFAULT_REMINDERS),
    ...patch,
  };
  ensure(
    [0, 1, 3].includes(reminders.daysBefore) &&
      Number.isInteger(reminders.hour) &&
      reminders.hour >= 0 &&
      reminders.hour <= 23,
    "Проверьте время напоминаний.",
  );
  return { ...state, settings: { ...state.settings, reminders } };
}
export function resetFinance(
  state: FinanceState,
  demo: boolean,
  today = localDate(),
): FinanceState {
  const next = createInitialState(demo, today);
  return {
    ...next,
    version: promoteFinanceVersion(state.version, next.version),
    settings: { ...next.settings, name: state.settings.name },
  };
}
export function restoreFinance(
  _state: FinanceState,
  backup: FinanceState,
  today = localDate(),
): FinanceState {
  return decodeBackup(encodeBackup(backup), today);
}
