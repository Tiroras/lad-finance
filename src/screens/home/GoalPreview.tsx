import { Pressable, StyleSheet } from "react-native";
import { useFinance } from "../../store";
import { C, font, Txt, Row, Icon, Progress, interactionStyles } from "../../ui";
import { goalSaved, money } from "../../domain/finance";
import type { Goal } from "../../domain/types";

export function GoalPreview({
  goal,
  onPress,
}: {
  goal: Goal;
  onPress: () => void;
}) {
  const { state } = useFinance();
  const saved = goalSaved(state, goal),
    progress = saved / goal.target;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Цель ${goal.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        st.goalPreview,
        { backgroundColor: goal.color },
        pressed && interactionStyles.pressed,
      ]}
    >
      <Row style={{ justifyContent: "space-between", marginBottom: 19 }}>
        <Icon name={goal.icon} size={24} color={C.green} />
        <Txt style={{ fontFamily: font.bold, fontSize: 11 }}>
          {Math.floor(progress * 100)}%
        </Txt>
      </Row>
      <Txt
        style={{ fontFamily: font.bold, fontSize: 13, marginBottom: 6 }}
        numberOfLines={1}
      >
        {goal.name}
      </Txt>
      <Txt style={{ fontSize: 11, color: "#71806D", marginBottom: 14 }}>
        {money(saved)}{" "}
        <Txt style={{ fontSize: 10, color: "#71806D" }}>
          из {money(goal.target)}
        </Txt>
      </Txt>
      <Progress
        value={progress}
        color={goal.id === "cushion" ? "#9C94B6" : "#6E8D60"}
        background="#FFFFFF88"
      />
    </Pressable>
  );
}

const st = StyleSheet.create({
  goalPreview: { flex: 1, minWidth: 140, borderRadius: 19, padding: 16 },
});
