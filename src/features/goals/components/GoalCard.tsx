import { View } from "react-native";
import { goalSaved } from "../../../domain/finance";
import type { Goal } from "../../../domain/types";
import { useMoney, useFinance } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  Button,
  C,
  Card,
  font,
  IconButton,
  IconTile,
  Progress,
  Row,
  Txt,
} from "../../../shared/ui";

export function GoalCard({ goal, open }: { goal: Goal; open: OpenSheet }) {
  const { money } = useMoney();
  const { state } = useFinance();
  const saved = goalSaved(state, goal),
    remaining = Math.max(0, goal.target - saved);
  const months = goal.monthly ? Math.ceil(remaining / goal.monthly) : null;
  return (
    <Card style={{ gap: 19 }}>
      <Row>
        <IconTile name={goal.icon} background={goal.color} size={50} />
        <View style={{ flex: 1, gap: 6 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 16 }}>{goal.name}</Txt>
          <Txt style={{ color: C.muted, fontSize: 11 }}>
            {remaining === 0
              ? "Цель достигнута. Это ваш момент!"
              : months
                ? `Ещё ${months} мес. при ${money(goal.monthly, false, goal.currency ?? "RUB")} в месяц`
                : "Накопления в свободном темпе"}
          </Txt>
        </View>
        <IconButton
          name="ellipsis-horizontal"
          label={`Изменить цель ${goal.name}`}
          onPress={() => open({ type: "goal", id: goal.id })}
        />
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt style={{ fontFamily: font.bold, fontSize: 23 }}>
          {money(saved, false, goal.currency ?? "RUB")}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          из {money(goal.target, false, goal.currency ?? "RUB")}
        </Txt>
      </Row>
      <Progress value={saved / goal.target} color="#78986A" height={8} />
      <Button
        label={remaining === 0 ? "Посмотреть накопления" : "Пополнить цель"}
        variant="secondary"
        icon="add"
        onPress={() => open({ type: "fund", id: goal.id })}
      />
    </Card>
  );
}
