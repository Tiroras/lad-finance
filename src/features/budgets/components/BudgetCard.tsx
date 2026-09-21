import { Pressable, View } from "react-native";
import { categorySpending } from "../../../domain/finance";
import { useMoney } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  C,
  Card,
  font,
  IconTile,
  Progress,
  Row,
  Txt,
} from "../../../shared/ui";

export function BudgetCard({
  category: c,
  open,
}: {
  category: ReturnType<typeof categorySpending>[number];
  open: OpenSheet;
}) {
  const { money } = useMoney();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.archived ? "Архивная категория" : "Изменить бюджет"}: ${c.name}`}
      onPress={() =>
        open({ type: c.archived ? "category" : "budget", id: c.id })
      }
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
            <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
              {c.name}
              {c.archived ? " · архив" : ""}
            </Txt>
            <Txt
              style={{
                fontSize: 10,
                color: !c.archived && c.spent > c.budget ? C.red : C.muted,
              }}
            >
              {c.archived
                ? "Расходы сохранены в истории"
                : c.spent > c.budget
                  ? `Сверх плана ${money(c.spent - c.budget)}`
                  : `Осталось ${money(c.budget - c.spent)}`}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end", gap: 5 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
              {money(c.spent)}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 10 }}>
              {c.archived ? "Лимит не действует" : `из ${money(c.budget)}`}
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
