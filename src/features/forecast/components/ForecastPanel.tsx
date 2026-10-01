import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  DEFAULT_FORECAST,
  forecast,
  type ForecastHorizon,
} from "../../../domain/forecast";
import { useMoney, useFinance } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import { Button, C, Notice, Txt } from "../../../shared/ui";
import { CurrencyNotice } from "../../currencies";
import { ForecastRange } from "./ForecastRange";
import { ForecastResultView } from "./ForecastResultView";
import { IncomePlans } from "../../incomes";

export function ForecastPanel({ open }: { open: OpenSheet }) {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const [horizon, setHorizon] = useState<ForecastHorizon>(30);
  const result = useMemo(
    () => forecast(state, horizon, today),
    [state, horizon, today],
  );
  const preferences = state.settings.forecast ?? DEFAULT_FORECAST;
  return (
    <View style={{ gap: 20 }}>
      <CurrencyNotice />
      <ForecastRange
        value={horizon}
        onChange={setHorizon}
        tourId="forecast.60"
      />
      <Button
        label="Настроить прогноз"
        icon="options-outline"
        variant="secondary"
        onPress={() => open({ type: "forecastSettings" })}
      />
      <ForecastResultView result={result} open={open} />
      <Button
        tourId="forecast.scenarios"
        label="Мои сценарии"
        icon="git-compare-outline"
        variant="secondary"
        onPress={() => open({ type: "scenarios" })}
      />
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
