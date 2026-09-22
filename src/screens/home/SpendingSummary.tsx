import { useMemo } from "react";
import { View } from "react-native";
import {
  categorySpending,
  dateLabel,
  monthKey,
  totals,
} from "../../domain/finance";
import { useMoney, useFinance } from "../../state/finance";
import type { Navigate } from "../../application/navigation/types";
import {
  C,
  Card,
  Donut,
  Empty,
  font,
  Row,
  Section,
  Txt,
} from "../../shared/ui";

export function SpendingSummary({
  navigate,
  hidden,
}: {
  navigate: Navigate;
  hidden: boolean;
}) {
  const { money, symbol: baseSymbol } = useMoney();
  const { state, today } = useFinance();
  const spending = useMemo(
    () =>
      categorySpending(state, monthKey(today), today).sort(
        (a, b) => b.spent - a.spent,
      ),
    [state, today],
  );
  const monthTotals = useMemo(
    () => totals(state, monthKey(today), today),
    [state, today],
  );
  return (
    <Card>
      <Section
        title="Куда уходят деньги"
        action="Аналитика"
        onPress={() => navigate("analytics")}
      />
      <Txt
        style={{
          color: C.muted,
          fontSize: 10,
          marginTop: -8,
          marginBottom: 16,
          textTransform: "capitalize",
        }}
      >
        {dateLabel(today, { month: "long" })}
      </Txt>
      {spending.some((category) => category.spent !== 0) ? (
        <Row style={{ gap: 18, justifyContent: "space-between" }}>
          <Donut
            size={146}
            data={spending
              .filter((c) => c.spent > 0)
              .map((c) => ({
                value: c.spent,
                color: c.color,
              }))}
            center={hidden ? `••• ${baseSymbol}` : money(monthTotals.expense)}
            subtitle="всего за месяц"
          />
          <View style={{ flex: 1, gap: 17 }}>
            {spending
              .filter((c) => c.spent !== 0)
              .slice(0, 3)
              .map((c) => (
                <View key={c.id} style={{ gap: 5 }}>
                  <Row style={{ gap: 6 }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: c.color,
                      }}
                    />
                    <Txt
                      numberOfLines={1}
                      style={{ fontSize: 10, color: C.muted, flex: 1 }}
                    >
                      {c.name}
                    </Txt>
                  </Row>
                  <Txt
                    style={{
                      marginLeft: 12,
                      fontSize: 13,
                      fontFamily: font.bold,
                    }}
                  >
                    {hidden ? `••• ${baseSymbol}` : money(c.spent)}
                  </Txt>
                </View>
              ))}
          </View>
        </Row>
      ) : (
        <Empty
          title="Чистый лист"
          description="Добавьте первый расход — здесь появится ваша картина месяца."
        />
      )}
    </Card>
  );
}
