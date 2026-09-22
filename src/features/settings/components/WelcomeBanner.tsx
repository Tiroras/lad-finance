import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { Button, Card, Txt } from "../../../shared/ui";

export function WelcomeBanner({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const actions = useFinanceActions();
  if (!state.demo || state.settings.onboardingCompleted !== false) return null;
  return (
    <Card style={{ gap: 12 }}>
      <Txt>
        Добро пожаловать в Лад. Сейчас показаны примеры — настройте свои остатки
        и планы за четыре шага.
      </Txt>
      <Button
        label="Настроить свой учёт"
        onPress={() => open({ type: "onboarding" })}
      />
      <Button
        label="Посмотреть пример"
        variant="secondary"
        onPress={() => actions.acceptDemo()}
      />
    </Card>
  );
}
