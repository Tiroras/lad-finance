import type { FinanceState } from "./types";

export const MAX_SCENARIOS = 20;
export const MAX_SCENARIO_CHANGES = 500;
export const MAX_SCENARIO_EVENTS = 100;
export const DATA_WARNING_RATIO = 0.8;
export const MAX_DATA_BYTES = 5_000_000;
export const MAX_TRANSACTIONS = 20_000;

export interface DataCapacity {
  key: string;
  name: string;
  used: number;
  limit: number;
  remedy: string;
}

export const nearCapacity = (used: number, limit: number) =>
  used >= Math.ceil(limit * DATA_WARNING_RATIO);

export function capacityMessage(entry: DataCapacity) {
  const status =
    entry.used >= entry.limit ? "Достигнут лимит" : "Приближение к лимиту";
  return `${status}: ${entry.name} — ${entry.used.toLocaleString("ru-RU")} из ${entry.limit.toLocaleString("ru-RU")}. ${entry.remedy}`;
}

/** Called only on the data settings screen, memoized for a given ledger. */
export function dataCapacity(state: FinanceState): DataCapacity[] {
  const fields = [
    [
      "transactions",
      "операции",
      state.transactions.length,
      MAX_TRANSACTIONS,
      "Сохраните резервную копию. Новую историю можно вести в отдельном профиле.",
    ],
    [
      "accounts",
      "счета",
      state.accounts.length,
      30,
      "Архивные счета тоже учитываются. Переиспользуйте существующий счёт или начните новый профиль, сохранив копию прежнего.",
    ],
    [
      "categories",
      "категории",
      state.categories.length,
      200,
      "Архивные категории тоже учитываются. Переиспользуйте существующие категории.",
    ],
    [
      "goals",
      "цели",
      state.goals.length,
      100,
      "Удалите ненужную цель; фактические переводы останутся в истории.",
    ],
    [
      "recurring",
      "планы платежей",
      state.recurring.length,
      200,
      "Удалите ненужный план, сохранив фактические операции.",
    ],
    [
      "plannedIncomes",
      "планы доходов",
      state.plannedIncomes?.length ?? 0,
      200,
      "Удалите ненужный план, сохранив фактические операции.",
    ],
    [
      "scenarios",
      "сценарии",
      state.scenarios?.length ?? 0,
      MAX_SCENARIOS,
      "Удалите ненужный вариант; реальный учёт не изменится.",
    ],
    [
      "balanceAdjustments",
      "корректировки",
      state.balanceAdjustments?.length ?? 0,
      5000,
      "Сохраните копию. Новую историю можно вести в отдельном профиле.",
    ],
    [
      "reconciliations",
      "сверки",
      state.reconciliations?.length ?? 0,
      1000,
      "Сохраните резервную копию. Новые сверки можно вести в отдельном профиле.",
    ],
    [
      "budgetPlans",
      "бюджеты",
      state.budgetPlans?.length ?? 0,
      200,
      "Переиспользуйте существующие бюджеты.",
    ],
    [
      "debts",
      "долги",
      state.debts?.length ?? 0,
      200,
      "Сохраните копию. Новую историю можно вести в отдельном профиле.",
    ],
    [
      "goalFundCycles",
      "циклы фондов",
      state.goalFundCycles?.length ?? 0,
      500,
      "Сохраните копию. Новую историю можно вести в отдельном профиле.",
    ],
    [
      "goalReleases",
      "возвраты из целей",
      state.goalReleases?.length ?? 0,
      500,
      "Сохраните копию. Новую историю можно вести в отдельном профиле.",
    ],
    [
      "categoryRules",
      "правила категорий",
      state.categoryRules?.length ?? 0,
      200,
      "Удалите ненужные правила.",
    ],
    [
      "transactionTemplates",
      "шаблоны операций",
      state.transactionTemplates?.length ?? 0,
      100,
      "Удалите ненужные шаблоны.",
    ],
    [
      "csvProfiles",
      "настройки CSV",
      state.csvProfiles?.length ?? 0,
      30,
      "Удалите ненужные настройки источников.",
    ],
  ] as const;
  const result: DataCapacity[] = fields.map(
    ([key, name, used, limit, remedy]) => ({ key, name, used, limit, remedy }),
  );
  result.push({
    key: "utf8",
    name: "размер учёта в байтах UTF-8",
    used: new TextEncoder().encode(JSON.stringify(state)).length,
    limit: MAX_DATA_BYTES,
    remedy:
      "Сохраните копию; сократите длинные заметки. Кириллица и эмодзи занимают несколько байтов. Старый большой учёт разрешено только уменьшать.",
  });
  return result;
}
