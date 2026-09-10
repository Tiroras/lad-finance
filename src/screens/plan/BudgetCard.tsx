import { View, Pressable } from "react-native";
import { C, font, Txt, Row, Card, IconTile, Progress } from "../../ui";
import { categorySpending, money } from "../../domain/finance";
import type { OpenSheet } from "../../navigation/types";

export function BudgetCard({
  category: c,
  open,
}: {
  category: ReturnType<typeof categorySpending>[number];
  open: OpenSheet;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Изменить бюджет: ${c.name}`}
      onPress={() => open({ type: "budget", id: c.id })}
    >
      <Card style={{ padding: 17 }}>
        <Row style={{ marginBottom: 16 }}>
          <IconTile
            name={c.icon}
            color={c.color}
            background={c.background}
            size={40}
          />
          <View style={{ flex: 1, gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>{c.name}</Txt>
            <Txt
              style={{
                fontSize: 10,
                color: c.spent > c.budget ? C.red : C.muted,
              }}
            >
              {c.spent > c.budget
                ? `Сверх плана ${money(c.spent - c.budget)}`
                : `Осталось ${money(c.budget - c.spent)}`}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end", gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
              {money(c.spent)}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 10 }}>
              из {money(c.budget)}
            </Txt>
          </View>
        </Row>
        <Progress
          value={c.budget ? c.spent / c.budget : c.spent ? 1 : 0}
          color={c.spent > c.budget ? "#CA8B78" : c.color}
        />
      </Card>
    </Pressable>
  );
}
