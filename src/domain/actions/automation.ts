import {
  categoryRuleSchema,
  transactionTemplateSchema,
  csvSourceProfileSchema,
  templateProblem,
  applyCsvProfile,
  validateAutomation,
  type CategoryRule,
  type TransactionTemplate,
  type CsvSourceProfile,
} from "../automation";
import { uid } from "../finance";
import type { FinanceState } from "../types";
import { ensure } from "./validation";

export type CategoryRuleInput = Omit<CategoryRule, "id"> & {
  id?: string;
  first?: boolean;
};
export type TransactionTemplateInput = Omit<TransactionTemplate, "id"> & {
  id?: string;
};
export type CsvProfileInput = Omit<CsvSourceProfile, "id"> & { id?: string };

export function saveCategoryRule(
  state: FinanceState,
  input: CategoryRuleInput,
): FinanceState {
  const entries = state.categoryRules ?? [];
  ensure(
    !input.id || entries.some((entry) => entry.id === input.id),
    "Правило уже удалено.",
  );
  ensure(
    !!input.id || entries.length < 200,
    "Можно сохранить не более 200 правил.",
  );
  const parsed = categoryRuleSchema.safeParse({
    ...input,
    id: input.id ?? uid(),
  });
  ensure(
    parsed.success,
    "Укажите условие до 120 символов и категорию правила.",
  );
  const rule = parsed.data;
  ensure(
    state.categories.some(
      (c) =>
        c.id === rule.category &&
        (!c.archived ||
          (!rule.enabled &&
            entries.find((entry) => entry.id === input.id)?.category === c.id)),
    ),
    "Выберите активную категорию.",
  );
  const next = {
    ...state,
    categoryRules: input.id
      ? entries.map((entry) => (entry.id === input.id ? rule : entry))
      : [...entries, rule],
  };
  if (input.first)
    next.categoryRules = [
      rule,
      ...next.categoryRules.filter((entry) => entry.id !== rule.id),
    ];
  validateAutomation(next);
  return next;
}
export function deleteCategoryRule(
  state: FinanceState,
  id: string,
): FinanceState {
  return {
    ...state,
    categoryRules: (state.categoryRules ?? []).filter((rule) => rule.id !== id),
  };
}
export function moveCategoryRule(
  state: FinanceState,
  id: string,
  direction: -1 | 1,
): FinanceState {
  ensure(
    direction === -1 || direction === 1,
    "Выберите направление перемещения правила.",
  );
  const rules = [...(state.categoryRules ?? [])];
  const index = rules.findIndex((rule) => rule.id === id);
  ensure(index >= 0, "Правило уже удалено.");
  const target = index + direction;
  if (target < 0 || target >= rules.length) return state;
  [rules[index], rules[target]] = [rules[target], rules[index]];
  return { ...state, categoryRules: rules };
}
export function saveTransactionTemplate(
  state: FinanceState,
  input: TransactionTemplateInput,
): FinanceState {
  const entries = state.transactionTemplates ?? [];
  ensure(
    !input.id || entries.some((entry) => entry.id === input.id),
    "Шаблон уже удалён.",
  );
  ensure(
    !!input.id || entries.length < 100,
    "Можно сохранить не более 100 шаблонов.",
  );
  const parsed = transactionTemplateSchema.safeParse({
    ...input,
    id: input.id ?? uid(),
  });
  ensure(parsed.success, "Проверьте название, сумму и счета шаблона.");
  const error = templateProblem(state, parsed.data);
  ensure(!error, error ?? "Проверьте шаблон.");
  const next = {
    ...state,
    transactionTemplates: input.id
      ? entries.map((entry) => (entry.id === input.id ? parsed.data : entry))
      : [...entries, parsed.data],
  };
  validateAutomation(next);
  return next;
}
export function deleteTransactionTemplate(
  state: FinanceState,
  id: string,
): FinanceState {
  return {
    ...state,
    transactionTemplates: (state.transactionTemplates ?? []).filter(
      (template) => template.id !== id,
    ),
  };
}
export function saveCsvProfile(
  state: FinanceState,
  input: CsvProfileInput,
): FinanceState {
  const entries = state.csvProfiles ?? [];
  ensure(
    !input.id || entries.some((entry) => entry.id === input.id),
    "Профиль уже удалён.",
  );
  ensure(
    !!input.id || entries.length < 30,
    "Можно сохранить не более 30 профилей CSV.",
  );
  const parsed = csvSourceProfileSchema.safeParse({
    ...input,
    id: input.id ?? uid(),
  });
  ensure(parsed.success, "Проверьте название и настройки профиля CSV.");
  applyCsvProfile(state, parsed.data, parsed.data.headers);
  const next = {
    ...state,
    csvProfiles: input.id
      ? entries.map((entry) => (entry.id === input.id ? parsed.data : entry))
      : [...entries, parsed.data],
  };
  validateAutomation(next);
  return next;
}
export function deleteCsvProfile(
  state: FinanceState,
  id: string,
): FinanceState {
  return {
    ...state,
    csvProfiles: (state.csvProfiles ?? []).filter(
      (profile) => profile.id !== id,
    ),
  };
}
