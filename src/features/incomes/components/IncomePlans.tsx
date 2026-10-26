import { Pressable, View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import { incomeVersions } from "../../../domain/incomes";
import { scheduleLabel } from "../../../domain/recurrence";
import { dateLabel } from "../../../domain/finance";
import { useMoney, useFinance } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  C,
  Card,
  font,
  Icon,
  Notice,
  RecordList,
  Row,
  Section,
  Txt,
} from "../../../shared/ui";

export function IncomePlans({
  open,
  full = false,
}: {
  open: OpenSheet;
  full?: boolean;
}) {
  const { money } = useMoney();
  const { state, today } = useFinance();
  return (
    <View style={{ gap: 12 }}>
      <Section
        title="План доходов"
        action="Добавить"
        onPress={() => open({ type: "income" })}
        style={{ marginBottom: 0 }}
      />
      <RecordList
        items={state.plannedIncomes ?? []}
        full={full}
        keyExtractor={(plan) => plan.id}
        showAllLabel="Все планы доходов"
        onShowAll={() => open({ type: "list", list: "incomes" })}
        testID="income-plans-list"
        renderItem={(plan) => {
          const latest = incomeVersions(plan)
            .filter((version) => !version.voided)
            .at(-1);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Доход: ${plan.name}`}
              onPress={() => open({ type: "income", id: plan.id })}
            >
              <Card style={{ padding: 16, gap: 7 }}>
                <Row style={{ justifyContent: "space-between", gap: 10 }}>
                  <Txt style={{ fontFamily: font.bold, fontSize: 14, flex: 1 }}>
                    {plan.name}
                  </Txt>
                  <Icon name="chevron-forward" size={16} color={C.muted} />
                </Row>
                <Txt style={{ fontSize: 12, color: C.green }}>
                  {money(
                    plan.amount,
                    false,
                    accountCurrency(state, plan.accountId),
                  )}{" "}
                  · {plan.paused ? "Приостановлен · " : ""}
                  {plan.schedule
                    ? scheduleLabel(plan.schedule)
                    : plan.repeat === "monthly"
                      ? `${Number(plan.date.slice(-2))}-го каждый месяц`
                      : dateLabel(plan.date)}
                </Txt>
                {latest && latest.effectiveFrom > today && (
                  <Txt style={{ fontSize: 12, color: C.muted }}>
                    Показаны условия с{" "}
                    {dateLabel(latest.effectiveFrom, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    {plan.versions &&
                    plan.versions.filter((version) => !version.voided).length >
                      1
                      ? ". До этой даты действует прежний график."
                      : "."}
                  </Txt>
                )}
                {(plan.versions?.length ?? 0) > 0 && (
                  <Txt style={{ fontSize: 12, color: C.muted }}>
                    Версий условий: {incomeVersions(plan).length}. Исторические
                    поступления сохраняются.
                  </Txt>
                )}
              </Card>
            </Pressable>
          );
        }}
      />
      {!state.plannedIncomes?.length && (
        <Notice>
          Добавьте зарплату, аванс или разовый доход с суммой и датой. Пока
          прогноз учитывает только текущие деньги и расходы.
        </Notice>
      )}
    </View>
  );
}
