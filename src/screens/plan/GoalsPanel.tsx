import { useFinance } from "../../store";
import { Section, Empty, Notice } from "../../ui";
import type { OpenSheet } from "../../navigation/types";
import { GoalCard } from "./GoalCard";

export function GoalsPanel({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  return (
    <>
      <Section
        title="То, ради чего"
        action="Новая цель"
        onPress={() => open({ type: "goal" })}
      />
      {state.goals.length ? (
        state.goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} open={open} />
        ))
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
        расходы и не меняет общий баланс.
      </Notice>
    </>
  );
}
