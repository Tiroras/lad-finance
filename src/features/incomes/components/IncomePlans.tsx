import { Pressable, View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
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
  Row,
  Section,
  Txt,
} from "../../../shared/ui";

export function IncomePlans({ open }: { open: OpenSheet }) {
  const { money } = useMoney();
  const { state } = useFinance();
  return (
    <View style={{ gap: 12 }}>
      <Section
        title="План доходов"
        action="Добавить"
        onPress={() => open({ type: "income" })}
        style={{ marginBottom: 0 }}
      />
      {(state.plannedIncomes ?? []).map((plan) => (
        <Pressable
          key={plan.id}
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
              ·{" "}
              {plan.schedule
                ? scheduleLabel(plan.schedule)
                : plan.repeat === "monthly"
                  ? `${Number(plan.date.slice(-2))}-го каждый месяц`
                  : dateLabel(plan.date)}
            </Txt>
          </Card>
        </Pressable>
      ))}
      {!state.plannedIncomes?.length && (
        <Notice>
          Добавьте зарплату, аванс или разовый доход с суммой и датой. Пока
          прогноз учитывает только текущие деньги и расходы.
        </Notice>
      )}
    </View>
  );
}
