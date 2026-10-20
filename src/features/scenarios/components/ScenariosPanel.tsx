import { View } from "react-native";
import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { Button, Card, ErrorText, Notice, Txt, font } from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  capacityMessage,
  MAX_SCENARIOS,
  nearCapacity,
} from "../../../domain/dataLimits";

export function ScenariosPanel({ open }: { open: OpenSheet }) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const list = state.scenarios ?? [];
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        Задержка зарплаты, новая аренда или крупная покупка: сравните варианты с
        текущим планом или друг с другом. Сохранённые условия каждый раз
        применяются к актуальному учёту.
      </Notice>
      {nearCapacity(list.length, MAX_SCENARIOS) && (
        <Notice tone="warning">
          {capacityMessage({
            key: "scenarios",
            name: "сценарии",
            used: list.length,
            limit: MAX_SCENARIOS,
            remedy: "Удалите ненужный вариант; реальный учёт не изменится.",
          })}
        </Notice>
      )}
      <ErrorText error={error} />
      <Button
        label="Создать сценарий"
        icon="add"
        disabled={list.length >= MAX_SCENARIOS}
        onPress={() => open({ type: "scenario" })}
      />
      {list.length === 0 && <Txt>Пока нет сохранённых сценариев.</Txt>}
      {list.map((scenario) => (
        <Card key={scenario.id} style={{ gap: 12 }}>
          <Txt style={{ fontFamily: font.bold }}>{scenario.name}</Txt>
          <Txt>
            {scenario.horizon} дней · изменений: {scenario.changes.length} ·
            событий: {scenario.events.length}
          </Txt>
          <Txt>
            Включено:{" "}
            {scenario.changes.filter((row) => row.enabled !== false).length}{" "}
            изменений и{" "}
            {scenario.events.filter((row) => row.enabled !== false).length}{" "}
            событий.
          </Txt>
          <Button
            label={`Открыть сценарий: ${scenario.name}`}
            variant="secondary"
            onPress={() => open({ type: "scenario", id: scenario.id })}
          />
          <Button
            label={`Копировать сценарий: ${scenario.name}`}
            variant="secondary"
            disabled={list.length >= MAX_SCENARIOS}
            onPress={() =>
              run(() => {
                actions.copyScenario(scenario.id);
                notify("Копия сценария сохранена; исходный вариант не изменён");
              })
            }
          />
        </Card>
      ))}
    </View>
  );
}
