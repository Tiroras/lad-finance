import { useMemo } from "react";
import type { OpenSheet } from "../../../application/navigation/types";
import { View } from "react-native";
import { categorySpending, totals } from "../../../domain/finance";
import { useFinance, useMoney } from "../../../state/finance";
import {
  C,
  Card,
  Donut,
  Empty,
  font,
  IconTile,
  Progress,
  RecordList,
  Row,
  Section,
  Txt,
} from "../../../shared/ui";

export function CategoryBreakdown({
  month,
  open,
  full = false,
}: {
  month: string;
  open: OpenSheet;
  full?: boolean;
}) {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const spending = useMemo(
    () =>
      categorySpending(state, month, today).sort((a, b) => b.spent - a.spent),
    [state, month, today],
  );
  const expense = useMemo(
    () => totals(state, month, today).expense,
    [state, month, today],
  );
  const positiveTotal = spending.reduce(
    (sum, category) => sum + Math.max(0, category.spent),
    0,
  );
  const hasRefundCredit = spending.some((category) => category.spent < 0);
  return (
    <Card>
      <Section title="Расходы по категориям" />
      {spending.some((category) => category.spent !== 0) ? (
        <>
          <View style={{ alignItems: "center", marginVertical: 10 }}>
            <Donut
              data={spending
                .filter((c) => c.spent > 0)
                .map((c) => ({ value: c.spent, color: c.color }))}
              center={money(expense)}
              subtitle="расходы за месяц"
              size={205}
            />
          </View>
          <View style={{ marginTop: 20, gap: 22 }}>
            <RecordList
              items={spending.filter((c) => c.spent !== 0)}
              full={full}
              keyExtractor={(c) => c.id}
              showAllLabel="Все расходы по категориям"
              onShowAll={() =>
                open({ type: "list", list: "spendingCategories", month })
              }
              testID="spending-categories-list"
              renderItem={(c) => (
                <View style={{ gap: 10 }}>
                  <Row>
                    <IconTile
                      name={c.icon}
                      color={c.color}
                      background={c.background}
                      size={35}
                    />
                    <Txt
                      style={{
                        flex: 1,
                        fontFamily: font.semibold,
                        fontSize: 12,
                      }}
                    >
                      {c.name}
                    </Txt>
                    <Txt style={{ fontSize: 10, color: C.muted }}>
                      {c.spent < 0
                        ? "Возвраты"
                        : `${Math.round((c.spent / positiveTotal) * 100)}%`}
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12,
                        minWidth: 80,
                        textAlign: "right",
                      }}
                    >
                      {money(c.spent)}
                    </Txt>
                  </Row>
                  {c.spent > 0 && (
                    <Progress value={c.spent / positiveTotal} color={c.color} />
                  )}
                </View>
              )}
            />
          </View>
          {hasRefundCredit && (
            <Txt
              style={{
                color: C.muted,
                fontSize: 11,
                lineHeight: 18,
                marginTop: 16,
              }}
            >
              Отрицательные суммы — возвраты сверх расходов этой категории за
              месяц. Доли на круге рассчитаны только по положительным суммам,
              общий итог учитывает все возвраты.
            </Txt>
          )}
        </>
      ) : (
        <Empty
          icon="pie-chart-outline"
          title="Ваш график ещё впереди"
          description="В этом месяце пока нет расходов."
        />
      )}
    </Card>
  );
}
