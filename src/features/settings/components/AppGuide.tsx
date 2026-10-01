import { ActivityIndicator, View } from "react-native";
import { Button, C, ErrorText, font, Txt } from "../../../shared/ui";
import { tourSteps, tourStepIndex } from "../lib/tourSteps";
import { useLearningProgress } from "../model/useLearningProgress";

export function AppGuide({
  onStart,
  close,
}: {
  onStart: (step?: string) => void;
  close: () => void;
}) {
  const learning = useLearningProgress();
  if (!learning.ready)
    return (
      <>
        <ActivityIndicator color={C.green} />
        <ErrorText error={learning.error} />
        {learning.error && (
          <Button
            label="Повторить загрузку обучения"
            onPress={() => void learning.retry().catch(() => undefined)}
          />
        )}
      </>
    );
  const current = tourSteps[tourStepIndex(learning.progress.step)];
  return (
    <>
      <Txt
        accessibilityRole="header"
        style={{ fontFamily: font.bold, fontSize: 23 }}
      >
        Экскурсия по приложению
      </Txt>
      <Txt style={{ lineHeight: 23 }}>
        Пройдите по настоящим экранам Лада. Подсказки выделят нужную кнопку, а
        вы откроете разделы сами: обзор, операции, план, аналитику и настройки.
      </Txt>
      <Txt style={{ color: C.muted, lineHeight: 21 }}>
        Экскурсия сама не создаёт операций и не меняет настройки. Её можно
        поставить на паузу и продолжить с того же места.
      </Txt>
      {learning.progress.status === "started" && (
        <>
          <Txt>Продолжим: {current.title}</Txt>
          <Button
            label="Продолжить экскурсию"
            disabled={learning.saving}
            onPress={() => onStart()}
          />
        </>
      )}
      <Button
        label={
          learning.progress.status === "new"
            ? "Начать экскурсию"
            : "Пройти всё приложение заново"
        }
        disabled={learning.saving}
        onPress={() => onStart(tourSteps[0].id)}
      />
      <View style={{ gap: 10 }}>
        <Txt style={{ fontFamily: font.semibold }}>
          Или начните с нужного экрана
        </Txt>
        {[
          ["Обзор и счета", "home-formula"],
          ["Операции", "transactions-filter"],
          ["План: бюджеты, цели, платежи и прогноз", "plan-budgets"],
          ["Аналитика", "analytics-month"],
          ["Настройки и перенос данных", "open-settings"],
        ].map(([label, id]) => (
          <Button
            key={id}
            label={label}
            variant="secondary"
            disabled={learning.saving}
            onPress={() => onStart(id)}
          />
        ))}
      </View>
      <ErrorText error={learning.error} />
      <Button label="Вернуться к учёту" variant="secondary" onPress={close} />
    </>
  );
}
