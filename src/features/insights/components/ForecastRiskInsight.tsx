import { useMemo } from "react";
import { View } from "react-native";
import { forecast } from "../../../domain/forecast";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, Card, Notice, Section } from "../../../shared/ui";

export function ForecastRiskInsight({
  onScenarios,
  onForecastSettings,
}: {
  onScenarios: () => void;
  onForecastSettings: () => void;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const result = useMemo(() => forecast(state, 30, today), [state, today]);
  const day = result.firstBelowBuffer ?? result.firstShortfall;
  if (!day) return null;
  return (
    <Card>
      <Section title="Проверить будущий план" />
      <View style={{ gap: 12 }}>
        <Notice tone="warning">
          По текущему прогнозу {dateLabel(day.date)} до резерва будет не хватать{" "}
          {money(result.buffer - day.balance)}. Ожидаемый остаток на конец дня:{" "}
          {money(day.balance)}. Расчёт на ближайшие 30 дней учитывает заданные
          планы и повседневные расходы.
        </Notice>
        <Notice>
          В сценарии можно проверить перенос дохода, изменение платежа или
          отложенную покупку. Условия реального учёта изменятся только после
          ваших отдельных действий.
        </Notice>
        <Button
          label="Проверить изменения в сценарии"
          variant="secondary"
          onPress={onScenarios}
        />
        <Button
          label="Настроить прогноз"
          variant="secondary"
          onPress={onForecastSettings}
        />
      </View>
    </Card>
  );
}
