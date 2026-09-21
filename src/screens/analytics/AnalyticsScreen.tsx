import { useState } from "react";
import { View } from "react-native";
import {
  categorySpending,
  monthKey,
  shiftDate,
  shiftMonth,
  totals,
} from "../../domain/finance";
import { useMoney, useFinance } from "../../state/finance";
import type { OpenSheet } from "../../application/navigation/types";
import {
  Button,
  font,
  Notice,
  Row,
  Txt,
  MonthPicker,
  ScreenHeading,
} from "../../shared/ui";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { MonthlyTotals } from "./MonthlyTotals";
import { SavingsSummary } from "./SavingsSummary";
import { SpendingChart } from "./SpendingChart";

export function AnalyticsScreen({ open }: { open: OpenSheet }) {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const [month, setMonth] = useState(monthKey());
  const spending = categorySpending(state, month).sort(
      (a, b) => b.spent - a.spent,
    ),
    monthTotals = totals(state, month);
  const end =
    month === monthKey(today)
      ? today
      : shiftDate(shiftMonth(`${month}-01`, 1), -1);
  const biggest = spending.find((c) => c.spent > 0);
  const daily = monthTotals.expense / Math.max(1, Number(end.slice(-2)));
  return (
    <View style={{ gap: 24 }}>
      <ScreenHeading
        eyebrow="ЦИФРЫ, КОТОРЫЕ ПОМОГАЮТ"
        title="Понять свои привычки"
        subtitle="Смотрите на картину целиком, без осуждения."
      />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ fontFamily: font.bold, fontSize: 14 }}>Ваш месяц</Txt>
        <MonthPicker month={month} onChange={setMonth} />
      </Row>
      <MonthlyTotals
        income={monthTotals.income}
        expense={monthTotals.expense}
      />
      <SpendingChart month={month} end={end} />
      {biggest && (
        <Notice>
          Больше всего в этом месяце — «{biggest.name}»:{" "}
          {Math.round((biggest.spent / monthTotals.expense) * 100)}% расходов. В
          среднем за день вы тратите {money(daily)}.
        </Notice>
      )}
      <CategoryBreakdown spending={spending} expense={monthTotals.expense} />
      <SavingsSummary
        income={monthTotals.income}
        expense={monthTotals.expense}
      />
      <Button
        variant="secondary"
        label="Проверить будущую покупку"
        icon="scan-outline"
        onPress={() => open({ type: "simulate" })}
      />
    </View>
  );
}
