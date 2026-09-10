import { View } from "react-native";
import {
  C,
  font,
  Txt,
  Row,
  Card,
  IconTile,
  Section,
  Progress,
  Empty,
  Donut,
} from "../../ui";
import { categorySpending, money } from "../../domain/finance";

export function CategoryBreakdown({
  spending,
  expense,
}: {
  spending: ReturnType<typeof categorySpending>;
  expense: number;
}) {
  return (
    <Card>
      <Section title="Расходы по категориям" />
      {expense > 0 ? (
        <>
          <View style={{ alignItems: "center", marginVertical: 10 }}>
            <Donut
              data={spending.map((c) => ({ value: c.spent, color: c.color }))}
              center={money(expense)}
              subtitle="расходы за месяц"
              size={205}
            />
          </View>
          <View style={{ marginTop: 20, gap: 22 }}>
            {spending
              .filter((c) => c.spent > 0)
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
                      {Math.round((c.spent / expense) * 100)}%
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
                  <Progress value={c.spent / expense} color={c.color} />
                </View>
              ))}
          </View>
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
