import { View } from "react-native";
import { uid } from "../../../domain/finance";
import { useMoney, useFinance } from "../../../state/finance";
import {
  Button,
  Card,
  Field,
  Segments,
  Txt,
  font,
  AmountField,
  DateField,
} from "../../../shared/ui";
import type { ScenarioDraft } from "../model/scenarioDraft";

export function ScenarioEvents({
  draft,
  onChange,
}: {
  draft: ScenarioDraft;
  onChange: (draft: ScenarioDraft) => void;
}) {
  const { symbol } = useMoney();
  const { today } = useFinance();
  return (
    <View style={{ gap: 16 }}>
      <Txt style={{ fontFamily: font.bold }}>Разовые события</Txt>
      {draft.events.map((event, index) => {
        const patch = (value: Partial<typeof event>) =>
          onChange({
            ...draft,
            events: draft.events.map((entry, i) =>
              i === index ? { ...entry, ...value } : entry,
            ),
          });
        return (
          <Card key={event.id} style={{ gap: 12 }}>
            <Field
              label="Название события"
              accessibilityLabel={`Название события ${index + 1}`}
              value={event.name}
              maxLength={120}
              onChangeText={(name) => patch({ name })}
            />
            <Segments
              value={event.type}
              options={[
                { value: "expense", label: "Расход" },
                { value: "income", label: "Доход" },
              ]}
              onChange={(type) => patch({ type })}
            />
            <AmountField
              label={`Сумма события, ${symbol}`}
              accessibilityLabel={`Сумма события ${index + 1}`}
              value={event.amount}
              onChangeText={(amount) => patch({ amount })}
            />
            <DateField
              label="Дата события"
              accessibilityLabel={`Дата события ${index + 1}`}
              value={event.date}
              onChangeText={(date) => patch({ date })}
            />
            <Button
              label={`Убрать событие ${index + 1}`}
              variant="secondary"
              onPress={() =>
                onChange({
                  ...draft,
                  events: draft.events.filter((_, i) => i !== index),
                })
              }
            />
          </Card>
        );
      })}
      <Button
        label="Добавить событие в сценарий"
        variant="secondary"
        disabled={draft.events.length >= 100}
        icon="add"
        onPress={() =>
          onChange({
            ...draft,
            events: [
              ...draft.events,
              {
                id: uid(),
                name: "Покупка",
                type: "expense",
                amount: "",
                date: today,
              },
            ],
          })
        }
      />
    </View>
  );
}
