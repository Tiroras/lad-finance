import { useState } from "react";
import { View } from "react-native";
import {
  budgetHistory,
  categoryBudget,
  type BudgetPlan,
} from "../../../domain/budgets";
import { dateLabel, shiftDate } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, C, font, Txt } from "../../../shared/ui";

export function BudgetHistory({ plan }: { plan: BudgetPlan }) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const [expanded, setExpanded] = useState(false);
  const [count, setCount] = useState(5);
  const history = budgetHistory(plan)
    .map((entry, index, entries) => ({
      ...entry,
      until: entries[index + 1]?.effectiveFrom,
    }))
    .reverse();
  return (
    <>
      <Button
        label={expanded ? "Скрыть историю условий" : "История условий бюджета"}
        variant="secondary"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <View testID="budget-conditions-history" style={{ gap: 14 }}>
          {history.slice(0, count).map((entry) => {
            const budget = categoryBudget(
              state,
              plan.categoryId,
              entry.effectiveFrom,
              today,
            );
            return (
              <View key={entry.id} style={{ gap: 6 }}>
                <Txt style={{ fontFamily: font.semibold }}>
                  С {dateLabel(entry.effectiveFrom)}
                  {entry.until
                    ? ` по ${dateLabel(shiftDate(entry.until, -1))}`
                    : ""}
                  {entry.effectiveFrom > today ? " · запланировано" : ""}
                </Txt>
                <Txt>
                  {entry.period === "weekly"
                    ? "Неделя"
                    : entry.period === "yearly"
                      ? "Год"
                      : `Месяц с ${entry.startDay}-го числа`}
                  ; первый лимит {money(budget.base, true)}
                </Txt>
                <Txt style={{ color: C.muted }}>
                  Перенос остатка:{" "}
                  {entry.rolloverSurplus ? "включён" : "выключен"}; перерасхода:{" "}
                  {entry.rolloverDeficit ? "включён" : "выключен"}.
                </Txt>
              </View>
            );
          })}
          {history.length > count && (
            <Button
              label="Ещё условия бюджета"
              variant="secondary"
              onPress={() => setCount(count + 5)}
            />
          )}
        </View>
      )}
    </>
  );
}
