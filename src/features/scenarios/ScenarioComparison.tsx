import { useMemo, useState } from "react";
import { View } from "react-native";
import { forecast } from "../../domain/forecast";
import { scenarioWarnings } from "../../domain/scenarios";
import type { SavedScenario } from "../../domain/types";
import { useMoney } from "../../hooks/useMoney";
import { useFinance } from "../../store";
import { Chip, Notice, Row, Txt } from "../../ui";
import { ForecastResultView } from "../forecast/ForecastResultView";

export function ScenarioComparison({ scenario }: { scenario: SavedScenario }) {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const [compareId, setCompareId] = useState("base");
  const other = state.scenarios?.find(
    (s) => s.id === compareId && s.id !== scenario.id,
  );
  const result = useMemo(
    () => forecast(state, scenario.horizon, today, undefined, scenario),
    [state, scenario, today],
  );
  const baseline = useMemo(
    () => forecast(state, scenario.horizon, today, undefined, other),
    [state, scenario.horizon, today, other],
  );
  const warnings = [
    ...scenarioWarnings(state, scenario, today),
    ...(other
      ? scenarioWarnings(state, other, today).map((w) => `${other.name}: ${w}`)
      : []),
  ];
  const delta = result.closingBalance - baseline.closingBalance;
  const outside = scenario.events.filter(
    (e) => e.date > result.days.at(-1)!.date,
  );
  return (
    <View style={{ gap: 18 }}>
      <Txt>Сравнить с</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        <Chip
          label="Текущий план"
          active={!other}
          onPress={() => setCompareId("base")}
        />
        {(state.scenarios ?? [])
          .filter((s) => s.id !== scenario.id)
          .map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              active={s.id === other?.id}
              onPress={() => setCompareId(s.id)}
            />
          ))}
      </Row>
      {warnings.map((warning, i) => (
        <Notice key={i}>{warning}</Notice>
      ))}
      {outside.length > 0 && (
        <Notice>
          За пределами периода: {outside.map((e) => e.name).join(", ")}. Эти
          события пока не влияют на результат.
        </Notice>
      )}
      <Txt testID="scenario-delta">
        Разница к концу периода: {delta > 0 ? "+" : ""}
        {money(delta, true)}.
      </Txt>
      <ForecastResultView
        result={result}
        baseline={baseline}
        labels={{
          result: scenario.name,
          baseline: other?.name ?? "Текущий план",
        }}
      />
      <Notice>
        Оба варианта рассчитаны от сегодняшних остатков на одинаковое число
        дней. Фактические операции и основной план не меняются. По мере
        изменения учёта сценарий пересчитывается заново.
      </Notice>
    </View>
  );
}
