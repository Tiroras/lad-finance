import { uid } from "../finance";
import {
  scenarioChangeCurrency,
  scenarioSchema,
  validateScenarioCurrencies,
} from "../scenarios";
import type { FinanceState, SavedScenario } from "../types";
import { ensure } from "./validation";

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
    input.id || list.length < 20,
    "Можно сохранить не более 20 сценариев.",
  );
  const result = scenarioSchema.safeParse({ ...input, id: input.id ?? uid() });
  ensure(
    result.success,
    "Проверьте название, суммы и даты сценария. Сдвиг дохода — целое число от −90 до 90 дней.",
  );
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
    scenarios: input.id
      ? list.map((s) => (s.id === input.id ? scenario : s))
      : [...list, scenario],
  };
}
export const deleteScenario = (
  state: FinanceState,
  id: string,
): FinanceState => ({
  ...state,
  scenarios: (state.scenarios ?? []).filter((s) => s.id !== id),
});
