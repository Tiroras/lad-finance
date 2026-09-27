import type { OpenSheet } from "../../../application/navigation/types";
import { canStartOnboarding } from "../../../domain/onboarding";
import { DEMO_ENABLED } from "../../../shared/lib/buildOptions";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { Button, Card, Txt } from "../../../shared/ui";

export function WelcomeBanner({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const actions = useFinanceActions();
  if (
    !canStartOnboarding(state) ||
    state.settings.onboardingCompleted !== false
  )
    return null;
  return (
    <Card style={{ gap: 12 }}>
      <Txt>
        {state.demo
          ? "Добро пожаловать в Лад. Сейчас показаны примеры — настройте свои остатки и планы за четыре шага."
          : "Добро пожаловать в Лад. Настройте свои остатки и планы за четыре шага."}
      </Txt>
      <Button
        label="Настроить свой учёт"
        onPress={() => open({ type: "onboarding" })}
      />
      {DEMO_ENABLED && state.demo && (
        <Button
          label="Посмотреть пример"
          variant="secondary"
          onPress={() => actions.acceptDemo()}
        />
      )}
    </Card>
  );
}
