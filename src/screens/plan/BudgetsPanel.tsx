import { View } from "react-native";
import { useFinance } from "../../store";
import { Button, Notice } from "../../ui";
import { categorySpending } from "../../domain/finance";
import type { OpenSheet } from "../../navigation/types";
import { BudgetSummary } from "./BudgetSummary";
import { BudgetCard } from "./BudgetCard";

export function BudgetsPanel({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const categories = categorySpending(state);
  const budget = categories.reduce((n, c) => n + c.budget, 0),
    spent = categories.reduce((n, c) => n + c.spent, 0);
  return (
    <>
      <BudgetSummary budget={budget} spent={spent} />
      <Button
        label="Категории и подкатегории"
        icon="grid-outline"
        variant="secondary"
        onPress={() => open({ type: "categories" })}
      />
      <Notice>
        Лимиты категорий помогают видеть темп расходов. Сумма «можно потратить»
        рассчитывается отдельно — по вашим счетам и обязательствам.
      </Notice>
      <View style={{ gap: 12 }}>
        {categories
          .filter((c) => !c.archived || c.spent > 0)
          .map((c) => (
            <BudgetCard key={c.id} category={c} open={open} />
          ))}
      </View>
    </>
  );
}
