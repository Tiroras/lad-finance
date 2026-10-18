import { View } from "react-native";
import { DEFAULT_FORECAST } from "../../../domain/forecast";
import { scenarioChangeCurrency } from "../../../domain/scenarios";
import { useMoney, useFinance } from "../../../state/finance";
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  Row,
  Txt,
  font,
  AmountField,
} from "../../../shared/ui";
import type { ScenarioDraft } from "../model/scenarioDraft";

export function ScenarioChanges({
  draft,
  onChange,
}: {
  draft: ScenarioDraft;
  onChange: (draft: ScenarioDraft) => void;
}) {
  const { moneyInput, symbol: baseSymbol } = useMoney();
  const { state } = useFinance();
  const sources = [
    ...(state.plannedIncomes ?? []).map((p) => ({
      source: "income" as const,
      sourceId: p.id,
      name: p.name,
      amount: p.amount,
      label: "Доход",
    })),
    ...state.recurring
      .filter((p) => p.active)
      .map((p) => ({
        source: "payment" as const,
        sourceId: p.id,
        name: p.name,
        amount: p.amount,
        label: "Платёж",
      })),
    ...state.goals.map((g) => ({
      source: "goal" as const,
      sourceId: g.id,
      name: g.name,
      amount: g.monthly,
      label: "Цель",
    })),
  ];
  const available = sources.filter(
    (s) =>
      !draft.changes.some(
        (c) => c.source === s.source && c.sourceId === s.sourceId,
      ),
  );
  return (
    <View style={{ gap: 16 }}>
      <Txt style={{ fontFamily: font.bold }}>Повседневные расходы</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        <Chip
          label="Как в плане"
          active={draft.dailySpending === undefined}
          onPress={() => onChange({ ...draft, dailySpending: undefined })}
        />
        <Chip
          label="Своя сумма в день"
          active={draft.dailySpending !== undefined}
          onPress={() =>
            onChange({
              ...draft,
              dailySpending:
                draft.dailySpending ??
                moneyInput(
                  (state.settings.forecast ?? DEFAULT_FORECAST).dailySpending,
                ),
            })
          }
        />
      </Row>
      {draft.dailySpending !== undefined && (
        <AmountField
          label={`В день, ${baseSymbol}`}
          accessibilityLabel="Расходы в день в сценарии"
          value={draft.dailySpending}
          onChangeText={(dailySpending) =>
            onChange({ ...draft, dailySpending })
          }
        />
      )}
      <Txt style={{ fontFamily: font.bold }}>Изменить условия плана</Txt>
      <Notice>
        Изменения относятся только к ещё не выполненным событиям. Сдвиг дохода
        применяется к каждому его будущему поступлению; уже полученное не
        повторяется. Просроченные счета сохраняют прежнюю сумму. Ноль отменяет
        будущий платёж или взнос только в сценарии.
      </Notice>
      <Row style={{ flexWrap: "wrap" }}>
        {available.map((s) => (
          <Chip
            key={`${s.source}:${s.sourceId}`}
            label={`${s.label}: ${s.name}`}
            onPress={() =>
              onChange({
                ...draft,
                changes: [
                  ...draft.changes,
                  {
                    source: s.source,
                    sourceId: s.sourceId,
                    name: s.name,
                    currency: scenarioChangeCurrency(state, s),
                    amount: moneyInput(
                      s.amount,
                      scenarioChangeCurrency(state, s),
                    ),
                    delayDays: "0",
                  },
                ],
              })
            }
          />
        ))}
      </Row>
      {sources.length === 0 && (
        <Txt>
          Сначала добавьте доход, платёж или цель в основной план. Разовые
          события можно добавить ниже.
        </Txt>
      )}
      {draft.changes.map((c, index) => {
        const patch = (value: Partial<typeof c>) =>
          onChange({
            ...draft,
            changes: draft.changes.map((entry, i) =>
              i === index ? { ...entry, ...value } : entry,
            ),
          });
        return (
          <Card key={`${c.source}:${c.sourceId}`} style={{ gap: 12 }}>
            <Txt style={{ fontFamily: font.bold }}>{c.name}</Txt>
            <AmountField
              label={`${c.source === "goal" ? "Взнос по графику" : "Новая сумма"}, ${scenarioChangeCurrency(state, c)}`}
              accessibilityLabel={`Сумма в сценарии: ${c.name}`}
              value={c.amount}
              onChangeText={(amount) => patch({ amount })}
            />
            {c.source === "income" && (
              <Field
                label="Сдвиг в днях: + позже, − раньше"
                accessibilityLabel={`Сдвиг дохода: ${c.name}`}
                value={c.delayDays}
                onChangeText={(delayDays) => patch({ delayDays })}
                keyboardType="numbers-and-punctuation"
                maxLength={4}
              />
            )}
            <Button
              label={`Убрать изменение: ${c.name}`}
              variant="secondary"
              onPress={() =>
                onChange({
                  ...draft,
                  changes: draft.changes.filter((_, i) => i !== index),
                })
              }
            />
          </Card>
        );
      })}
    </View>
  );
}
