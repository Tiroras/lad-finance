import { useFinance } from "../../../state/finance";
import { Section, Empty, Notice, RecordList } from "../../../shared/ui";
import type { OpenSheet } from "../../../application/navigation/types";
import { GoalCard } from "./GoalCard";

export function GoalsPanel({
  open,
  full = false,
}: {
  open: OpenSheet;
  full?: boolean;
}) {
  const { state } = useFinance();
  return (
    <>
      <Section
        title="То, ради чего"
        action="Новая цель"
        onPress={() => open({ type: "goal" })}
      />
      {state.goals.length ? (
        <RecordList
          items={state.goals}
          full={full}
          keyExtractor={(goal) => goal.id}
          renderItem={(goal) => <GoalCard goal={goal} open={open} />}
          showAllLabel="Все цели"
          onShowAll={() => open({ type: "list", list: "goals" })}
          testID="goals-list"
        />
      ) : (
        <Empty
          icon="flag-outline"
          title="На что вы мечтаете накопить?"
          description="От поездки на выходные до подушки спокойствия. Начните с одной цели."
          action="Создать цель"
          onPress={() => open({ type: "goal" })}
        />
      )}
      <Notice>
        Пополнение цели — перевод между вашими счетами. Оно не увеличивает
        расходы. При обмене общий эквивалент может измениться из-за фактического
        курса.
      </Notice>
    </>
  );
}
