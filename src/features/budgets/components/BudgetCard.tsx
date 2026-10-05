import { Pressable, View } from "react-native";
import { categoryBudgets } from "../../../domain/budgets";
import { dateLabel, shiftDate } from "../../../shared/lib/dates";
import { useMoney } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  C,
  Card,
  font,
  IconTile,
  Icon,
  interactionStyles,
  Progress,
  Row,
  Txt,
} from "../../../shared/ui";
import { BudgetActivity } from "./BudgetActivity";

export function BudgetCard({
  category: c,
  open,
  expanded,
  onToggle,
}: {
  category: ReturnType<typeof categoryBudgets>[number];
  open: OpenSheet;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { money } = useMoney();
  return (
    <Card style={{ padding: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.archived ? "Архивная категория" : "Изменить бюджет"}: ${c.name}`}
        onPress={() =>
          open({ type: c.archived ? "category" : "budget", id: c.id })
        }
        style={({ pressed }) => [
          { padding: 17 },
          pressed && interactionStyles.pressed,
        ]}
      >
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
                  ? `Сверх плана ${money(c.spent - c.budget, true)}`
                  : `Осталось ${money(c.budget - c.spent, true)}`}
            </Txt>
          </View>
          <View
            style={{
              alignItems: "flex-end",
              gap: 5,
              flexShrink: 1,
              maxWidth: "50%",
            }}
          >
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 13,
                textAlign: "right",
              }}
            >
              {money(c.spent, true)}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 10, textAlign: "right" }}>
              {c.archived
                ? "Лимит не действует"
                : `из ${money(c.budget, true)}`}
            </Txt>
          </View>
        </Row>
        <Progress
          value={c.budget ? c.spent / c.budget : c.spent ? 1 : 0}
          color={c.spent > c.budget ? "#CA8B78" : c.color}
        />
        <Txt style={{ color: C.muted, fontSize: 10, marginTop: 10 }}>
          {dateLabel(c.start)} — {dateLabel(shiftDate(c.end, -1))}
          {c.carried ? ` · перенос ${money(c.carried, true)}` : ""}
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Расходы за период: ${c.name}`}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={onToggle}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 48,
            paddingHorizontal: 17,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: C.border,
          },
          pressed && interactionStyles.pressed,
        ]}
      >
        <Txt
          style={{
            flex: 1,
            color: C.green,
            fontFamily: font.semibold,
            fontSize: 13,
          }}
        >
          Расходы за период
        </Txt>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={C.green}
        />
      </Pressable>
      {expanded && <BudgetActivity categoryId={c.id} open={open} />}
    </Card>
  );
}
