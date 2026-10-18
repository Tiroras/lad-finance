import { View } from "react-native";
import {
  goalSaved,
  goalScheduleSummary,
  goalVersions,
} from "../../../domain/goals";
import { dateLabel } from "../../../shared/lib/dates";
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
  const { state, today } = useFinance();
  const saved = goalSaved(state, goal, today),
    remaining = Math.max(0, goal.target - saved);
  const summary = goalScheduleSummary(state, goal, today);
  const latest = goalVersions(goal, state.settings.forecast?.goalDay ?? 31)
    .filter((version) => !version.voided)
    .at(-1)!;
  const paidFund =
    state.goalFundCycles?.some(
      (cycle) => cycle.goalId === goal.id && cycle.status === "paid",
    ) &&
    !state.goalFundCycles?.some(
      (cycle) => cycle.goalId === goal.id && cycle.status === "active",
    );
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
              : paidFund
                ? "Цикл фонда завершён. Следующий создайте у платежа."
                : goal.versions
                  ? summary.estimatedDate
                    ? `По графику — к ${dateLabel(summary.estimatedDate, { day: "numeric", month: "long", year: "numeric" })}`
                    : "Срок достижения при текущем взносе не определён"
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
      {goal.versions && !paidFund && remaining > 0 && (
        <View style={{ gap: 8 }}>
          {latest.effectiveFrom > today && (
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Новые условия с {dateLabel(latest.effectiveFrom)}.
            </Txt>
          )}
          {summary.nextDate && (
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Ближайший взнос: {dateLabel(summary.nextDate)}.
            </Txt>
          )}
          {summary.deadline && (
            <Txt
              style={{
                color: summary.reachable ? C.muted : C.red,
                fontSize: 12,
              }}
            >
              {summary.requiredContribution === null
                ? "До срока нет будущих дат взносов: измените срок или график."
                : `До ${dateLabel(summary.deadline)} нужно по ${money(summary.requiredContribution, true, goal.currency ?? "RUB")} на ${summary.remainingDates} дат. ${summary.reachable ? "" : "Текущий взнос не покрывает срок."}`}
            </Txt>
          )}
        </View>
      )}
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
