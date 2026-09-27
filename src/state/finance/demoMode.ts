import { createInitialState } from "../../domain/seed";
import type { FinanceState } from "../../domain/types";
import { DEMO_ENABLED } from "../../shared/lib/buildOptions";
import { localDate } from "../../shared/lib/dates";

export function createStartupState(
  today = localDate(),
  demoEnabled = false,
): FinanceState {
  const initial = createInitialState(demoEnabled, today);
  return {
    ...initial,
    settings: { ...initial.settings, onboardingCompleted: false },
  };
}

export function assertDemoAllowed(
  state: FinanceState,
  demoEnabled = DEMO_ENABLED,
) {
  if (state.demo && !demoEnabled)
    throw new Error(
      "Демонстрационный режим недоступен в этой версии. Выберите копию своего личного учёта.",
    );
}
