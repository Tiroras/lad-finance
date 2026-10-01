import { useMemo, useState } from "react";
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
  TourTarget,
  useTourAction,
} from "../../shared/ui";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { MonthlyTotals } from "./MonthlyTotals";
import { SavingsSummary } from "./SavingsSummary";
import { SpendingChart } from "./SpendingChart";
import {
  MonthOverview,
  ForecastRiskInsight,
  RecurringSuggestions,
  SpendingComparison,
} from "../../features/insights";

export function AnalyticsScreen({ open }: { open: OpenSheet }) {
  const tourAction = useTourAction();
  const { money } = useMoney();
  const { state, today } = useFinance();
  const [month, setMonth] = useState(monthKey(today));
  const spending = useMemo(
    () =>
      categorySpending(state, month, today).sort((a, b) => b.spent - a.spent),
    [state, month, today],
  );
  const monthTotals = useMemo(
    () => totals(state, month, today),
    [state, month, today],
  );
  const end =
    month === monthKey(today)
      ? today
      : shiftDate(shiftMonth(`${month}-01`, 1), -1);
  const biggest = spending.find((c) => c.spent > 0);
  const positiveSpending = spending.reduce(
    (sum, category) => sum + Math.max(0, category.spent),
    0,
  );
  const daily = monthTotals.expense / Math.max(1, Number(end.slice(-2)));
  return (
    <View testID="screen-analytics" style={{ gap: 24 }}>
      <ScreenHeading
        eyebrow="ЦИФРЫ, КОТОРЫЕ ПОМОГАЮТ"
        title="Понять свои привычки"
        subtitle="Смотрите на картину целиком, без осуждения."
      />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ fontFamily: font.bold, fontSize: 14 }}>Ваш месяц</Txt>
        <TourTarget id="analytics.month">
          <MonthPicker
            month={month}
            onChange={(value) => {
              setMonth(value);
              tourAction("analytics.month");
            }}
          />
        </TourTarget>
      </Row>
      <MonthlyTotals
        income={monthTotals.income}
        expense={monthTotals.expense}
      />
      <SpendingComparison
        month={month}
        onOpenTransaction={(id) => open({ type: "transaction", id })}
      />
      <SpendingChart month={month} end={end} />
      {biggest && (
        <Notice>
          Больше всего в этом месяце — «{biggest.name}»:{" "}
          {Math.round((biggest.spent / positiveSpending) * 100)}% положительных
          сумм категорий. Расходы с учётом возвратов в среднем за день:{" "}
          {money(daily)}.
        </Notice>
      )}
      <CategoryBreakdown spending={spending} expense={monthTotals.expense} />
      <SavingsSummary
        income={monthTotals.income}
        expense={monthTotals.expense}
      />
      <MonthOverview month={month} />
      <ForecastRiskInsight
        onScenarios={() => open({ type: "scenarios" })}
        onForecastSettings={() => open({ type: "forecastSettings" })}
      />
      <RecurringSuggestions
        onCreate={(sourceTransactionId) =>
          open({ type: "recurring", sourceTransactionId })
        }
        onOpenTransaction={(id) => open({ type: "transaction", id })}
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
