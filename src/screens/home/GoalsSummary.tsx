import { View } from "react-native";
import { useFinance } from "../../store";
import { Card, Section, Empty } from "../../ui";
import type { OpenSheet, Navigate } from "../../navigation/types";
import { GoalPreview } from "./GoalPreview";

export function GoalsSummary({
  open,
  navigate,
}: {
  open: OpenSheet;
  navigate: Navigate;
}) {
  const { state } = useFinance();
  return (
    <View>
      <Section
        title="Ближе к мечте"
        action="Все цели"
        onPress={() => navigate("plan")}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {state.goals.length ? (
          state.goals
            .slice(0, 2)
            .map((goal) => (
              <GoalPreview
                key={goal.id}
                goal={goal}
                onPress={() => open({ type: "fund", id: goal.id })}
              />
            ))
        ) : (
          <Card style={{ flex: 1 }}>
            <Empty
              icon="flag-outline"
              title="У денег может быть мечта"
              description="Создайте цель и двигайтесь к ней в своём темпе."
              action="Создать цель"
              onPress={() => open({ type: "goal" })}
            />
          </Card>
        )}
      </View>
    </View>
  );
}
