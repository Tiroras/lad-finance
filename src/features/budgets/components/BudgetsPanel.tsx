import { useState } from "react";
import { View } from "react-native";
import { useFinance } from "../../../state/finance";
import { Button, Notice } from "../../../shared/ui";
import { categoryBudgets } from "../../../domain/budgets";
import type { OpenSheet } from "../../../application/navigation/types";
import { BudgetSummary } from "./BudgetSummary";
import { BudgetCard } from "./BudgetCard";

export function BudgetsPanel({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const [expandedId, setExpandedId] = useState<string>();
  const categories = categoryBudgets(state, today, today);
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
          .filter((c) => !c.archived || c.hasActivity)
          .map((c) => (
            <BudgetCard
              key={c.id}
              category={c}
              open={open}
              expanded={expandedId === c.id}
              onToggle={() =>
                setExpandedId(expandedId === c.id ? undefined : c.id)
              }
            />
          ))}
      </View>
    </>
  );
}
