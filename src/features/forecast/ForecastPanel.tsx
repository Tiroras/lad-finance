import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  DEFAULT_FORECAST,
  forecast,
  type ForecastHorizon,
} from "../../domain/forecast";
import { money } from "../../domain/finance";
import type { OpenSheet } from "../../navigation/types";
import { useFinance } from "../../store";
import { Button, C, Notice, Txt } from "../../ui";
import { ForecastRange } from "./ForecastRange";
import { ForecastResultView } from "./ForecastResultView";
import { IncomePlans } from "./IncomePlans";

export function ForecastPanel({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const [horizon, setHorizon] = useState<ForecastHorizon>(30);
  const result = useMemo(
    () => forecast(state, horizon, today),
    [state, horizon, today],
  );
  const preferences = state.settings.forecast ?? DEFAULT_FORECAST;
  return (
    <View style={{ gap: 20 }}>
      <ForecastRange value={horizon} onChange={setHorizon} />
      <Button
        label="Настроить прогноз"
        icon="options-outline"
        variant="secondary"
        onPress={() => open({ type: "forecastSettings" })}
      />
      <ForecastResultView result={result} open={open} />
      <IncomePlans open={open} />
      <Notice>
        Повседневные расходы: {money(preferences.dailySpending)} в день с
        завтрашнего дня. Взносы на цели — {preferences.goalDay}-го числа; в
        коротком месяце — в последний день.
      </Notice>
      <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 19 }}>
        Расчёт на конец дня по всем повседневным счетам вместе. Неоплаченные
        счета и остаток пропущенного взноса этого месяца учтены сегодня.
        Прошедшие даты доходов не переносятся автоматически. Резерв — ориентир
        на графике, а накопления остаются отдельно. Неучтённые операции изменят
        прогноз.
      </Txt>
      <Button
        label="Примерить покупку"
        icon="bag-handle-outline"
        onPress={() => open({ type: "simulate" })}
      />
    </View>
  );
}
