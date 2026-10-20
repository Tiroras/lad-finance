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
  Toggle,
  Row,
  Notice,
  Chip,
} from "../../../shared/ui";
import type { ScenarioDraft } from "../model/scenarioDraft";
import { AccountPicker } from "../../accounts";
import {
  capacityMessage,
  MAX_SCENARIO_EVENTS,
  nearCapacity,
} from "../../../domain/dataLimits";

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
      {nearCapacity(draft.events.length, MAX_SCENARIO_EVENTS) && (
        <Notice tone="warning">
          {capacityMessage({
            key: "events",
            name: "разовые события",
            used: draft.events.length,
            limit: MAX_SCENARIO_EVENTS,
            remedy: "Удалите ненужные строки; выключенные тоже занимают место.",
          })}
        </Notice>
      )}
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
            <Row>
              <Txt style={{ flex: 1 }}>
                {event.enabled === false
                  ? "Событие выключено"
                  : "Участвует в расчёте"}
              </Txt>
              <Toggle
                accessibilityLabel={`Учитывать событие ${index + 1}: ${event.name}`}
                value={event.enabled !== false}
                onValueChange={(enabled) => patch({ enabled })}
              />
            </Row>
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
            <AccountPicker
              label={`Счёт события ${index + 1}`}
              selected={event.accountId ?? ""}
              spendingOnly
              onChange={(accountId) => patch({ accountId })}
            />
            <Chip
              label={`Без назначения счёта: событие ${index + 1}`}
              active={!event.accountId}
              onPress={() => patch({ accountId: undefined })}
            />
            <Notice>
              Сумма события задана в основной валюте. Для выбранного счёта
              используется текущий курс. Без назначения сумма остаётся в общем
              прогнозе, но достаточность отдельного счёта не подтверждается.
            </Notice>
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
        disabled={draft.events.length >= MAX_SCENARIO_EVENTS}
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
                enabled: true,
              },
            ],
          })
        }
      />
    </View>
  );
}
