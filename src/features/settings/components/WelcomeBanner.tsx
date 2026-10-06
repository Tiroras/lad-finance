import type { OpenSheet } from "../../../application/navigation/types";
import { canStartOnboarding } from "../../../domain/onboarding";
import { DEMO_ENABLED } from "../../../shared/lib/buildOptions";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { Button, Card, ErrorText, Txt } from "../../../shared/ui";
import { useLearningProgress } from "../model/useLearningProgress";
import { tourSteps, tourStepIndex } from "../lib/tourSteps";

export function WelcomeBanner({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const actions = useFinanceActions();
  const learning = useLearningProgress();
  if (learning.ready && learning.progress.status === "started") {
    return (
      <Card style={{ gap: 12 }}>
        <Txt>Экскурсия по приложению</Txt>
        <Txt>{tourSteps[tourStepIndex(learning.progress.step)].title}</Txt>
        <ErrorText error={learning.error} />
        <Button
          label="Продолжить обучение"
          disabled={learning.saving}
          onPress={() => open({ type: "guide", journey: true })}
        />
        <Button
          label="Пропустить экскурсию"
          variant="secondary"
          disabled={learning.saving}
          onPress={() => void learning.skip().catch(() => undefined)}
        />
      </Card>
    );
  }
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
        onPress={() =>
          open({ type: "onboarding", startWithAccounts: !state.demo })
        }
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
