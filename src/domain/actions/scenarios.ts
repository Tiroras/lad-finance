import { uid } from "../finance";
import { promoteFinanceVersion } from "../financeVersion";
import {
  scenarioChangeCurrency,
  scenarioSchemaV8,
  scenarioValidationMessage,
  validateScenarioCurrencies,
} from "../scenarios";
import type { FinanceState, SavedScenario } from "../types";
import { ensure } from "./validation";
import { MAX_SCENARIOS } from "../dataLimits";

export type ScenarioInput = Omit<SavedScenario, "id"> & { id?: string };
export function saveScenario(
  state: FinanceState,
  input: ScenarioInput,
): FinanceState {
  const list = state.scenarios ?? [];
  ensure(
    !input.id || list.some((s) => s.id === input.id),
    "Сценарий уже удалён.",
  );
  ensure(
    input.id || list.length < MAX_SCENARIOS,
    "Можно сохранить не более 20 сценариев. Удалите ненужный вариант; реальный учёт не изменится.",
  );
  const result = scenarioSchemaV8.safeParse({
    ...input,
    id: input.id ?? uid(),
  });
  if (!result.success) throw new Error(scenarioValidationMessage(result.error));
  const scenario = {
    ...result.data,
    changes: result.data.changes.map((c) => ({
      ...c,
      currency: scenarioChangeCurrency(state, c),
    })),
  };
  validateScenarioCurrencies(state, scenario);
  return {
    ...state,
    version:
      scenario.changes.some((row) => row.enabled !== undefined) ||
      scenario.events.some(
        (row) => row.enabled !== undefined || row.accountId !== undefined,
      )
        ? promoteFinanceVersion(state.version, 8)
        : state.version,
    scenarios: input.id
      ? list.map((s) => (s.id === input.id ? scenario : s))
      : [...list, scenario],
  };
}

export function copyScenario(state: FinanceState, id: string): FinanceState {
  const original = state.scenarios?.find((scenario) => scenario.id === id);
  ensure(original, "Сценарий уже удалён. Откройте список сценариев заново.");
  const usedIds = new Set(
    (state.scenarios ?? []).flatMap((scenario) => [
      scenario.id,
      ...scenario.events.map((event) => event.id),
    ]),
  );
  const nextId = () => {
    let value = uid();
    while (usedIds.has(value)) value = uid();
    usedIds.add(value);
    return value;
  };
  const copy = {
    ...original,
    id: nextId(),
    name: `${original.name.slice(0, 112)} — копия`,
    changes: original.changes.map((change) => ({ ...change })),
    events: original.events.map((event) => ({ ...event, id: nextId() })),
  };
  ensure(
    (state.scenarios ?? []).length < MAX_SCENARIOS,
    "Можно сохранить не более 20 сценариев. Удалите ненужный вариант перед копированием; реальный учёт не изменится.",
  );
  return {
    ...state,
    version: promoteFinanceVersion(state.version, 8),
    scenarios: [...(state.scenarios ?? []), copy],
  };
}
export const deleteScenario = (
  state: FinanceState,
  id: string,
): FinanceState => ({
  ...state,
  scenarios: (state.scenarios ?? []).filter((s) => s.id !== id),
});
