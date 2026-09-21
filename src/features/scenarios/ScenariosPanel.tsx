import { View } from "react-native";
import type { OpenSheet } from "../../navigation/types";
import { useFinance } from "../../store";
import { Button, Card, Notice, Txt, font } from "../../ui";

export function ScenariosPanel({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const list = state.scenarios ?? [];
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        Задержка зарплаты, новая аренда или крупная покупка: сравните варианты с
        текущим планом или друг с другом. Сохранённые условия каждый раз
        применяются к актуальному учёту.
      </Notice>
      <Button
        label="Создать сценарий"
        icon="add"
        disabled={list.length >= 20}
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
          <Button
            label={`Открыть сценарий: ${scenario.name}`}
            variant="secondary"
            onPress={() => open({ type: "scenario", id: scenario.id })}
          />
        </Card>
      ))}
    </View>
  );
}
