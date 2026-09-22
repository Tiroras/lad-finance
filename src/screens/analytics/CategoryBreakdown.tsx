import { View } from "react-native";
import { categorySpending } from "../../domain/finance";
import { useMoney } from "../../state/finance";
import {
  C,
  Card,
  Donut,
  Empty,
  font,
  IconTile,
  Progress,
  Row,
  Section,
  Txt,
} from "../../shared/ui";

export function CategoryBreakdown({
  spending,
  expense,
}: {
  spending: ReturnType<typeof categorySpending>;
  expense: number;
}) {
  const { money } = useMoney();
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
            {spending
              .filter((c) => c.spent !== 0)
              .map((c) => (
                <View key={c.id} style={{ gap: 10 }}>
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
              ))}
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
