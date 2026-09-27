import { useSheetScrollToStart } from "../../../shared/ui";
import { QuickTour } from "./QuickTour";

export function AppGuide({ close }: { close: () => void }) {
  const scrollToStart = useSheetScrollToStart();
  return (
    <QuickTour
      onComplete={close}
      onSkip={close}
      finishLabel="Готово"
      skipLabel="Закрыть знакомство"
      backAccessibilityLabel="Предыдущий шаг знакомства"
      onStepChange={scrollToStart}
    />
  );
}
