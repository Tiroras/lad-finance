import { useState } from "react";
import { View } from "react-native";
import { baseCurrency } from "../../domain/currency";
import { expenseContributions } from "../../domain/transactionAmounts";
import { dateLabel, money, shiftDate } from "../../domain/finance";
import { useFinance } from "../../state/finance";
import { BarChart, C, Card, Section, Segments, Txt } from "../../shared/ui";

export function SpendingChart({ month, end }: { month: string; end: string }) {
  const { state } = useFinance();
  const [period, setPeriod] = useState("week");
  const count =
    period === "week"
      ? Math.min(7, Number(end.slice(-2)))
      : Number(end.slice(-2));
  const dates = Array.from({ length: count }, (_, i) =>
    shiftDate(end, i - count + 1),
  );
  const values = dates.map((date) =>
    state.transactions
      .filter((t) => t.date === date)
      .reduce(
        (n, t) =>
          n +
          expenseContributions(state, t).reduce(
            (sum, part) => sum + part.amount,
            0,
          ),
        0,
      ),
  );

  return (
    <Card>
      <Section title="В вашем ритме" />
      <Segments
        value={period}
        onChange={setPeriod}
        options={[
          { value: "week", label: "Последние 7 дней" },
          { value: "month", label: "Весь месяц" },
        ]}
      />
      <View style={{ marginTop: 24 }}>
        <BarChart
          key={`${month}-${period}`}
          values={values}
          formatValue={(value) => money(value, false, baseCurrency(state))}
          labels={dates.map((d) =>
            period === "week"
              ? dateLabel(d, { weekday: "short" })
              : dateLabel(d, { day: "numeric", month: "short" }),
          )}
        />
        {values.some((value) => value < 0) && (
          <Txt
            style={{
              color: C.muted,
              fontSize: 11,
              lineHeight: 18,
              marginTop: 12,
            }}
          >
            Ниже нуля — дни, когда возвраты превысили расходы. Основная сумма
            долгов и переводы не учитываются.
          </Txt>
        )}
      </View>
    </Card>
  );
}
