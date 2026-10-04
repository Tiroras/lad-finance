import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { Navigate } from "../../application/navigation/types";
import { dateLabel, monthKey, totals } from "../../domain/finance";
import { useFinance, useMoney } from "../../state/finance";
import { Button, C, Card, font, Txt } from "../../shared/ui";

export function HomeMonthSummary({
  navigate,
  hidden,
}: {
  navigate: Navigate;
  hidden: boolean;
}) {
  const { state, today } = useFinance();
  const { money, symbol } = useMoney();
  const monthTotals = useMemo(
    () => totals(state, monthKey(today), today),
    [state, today],
  );
  return (
    <View testID="home-month-summary">
      <Card style={s.card}>
        <Txt accessibilityRole="header" style={s.heading}>
          Этот месяц · {dateLabel(today, { month: "long" })}
        </Txt>
        <View style={s.metrics}>
          {(
            [
              ["income", "Доходы"],
              ["expense", "Расходы"],
            ] as const
          ).map(([type, label]) => (
            <View key={type} style={s.metric}>
              <Txt style={s.label}>{label}</Txt>
              <Txt
                testID={`home-month-${type}`}
                accessibilityLabel={hidden ? "Сумма скрыта" : undefined}
                style={[s.amount, type === "income" && { color: C.green }]}
              >
                {hidden ? `••• ${symbol}` : money(monthTotals[type])}
              </Txt>
            </View>
          ))}
        </View>
        <Button
          label="Подробнее в аналитике"
          icon="arrow-forward"
          variant="secondary"
          style={s.link}
          onPress={() => navigate("analytics")}
        />
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  heading: { fontFamily: font.semibold, fontSize: 14 },
  metrics: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  metric: { flex: 1, minWidth: 0, gap: 6 },
  label: { color: C.muted, fontSize: 12 },
  amount: { fontFamily: font.bold, fontSize: 21, letterSpacing: -0.5 },
  link: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    justifyContent: "flex-start",
  },
});
