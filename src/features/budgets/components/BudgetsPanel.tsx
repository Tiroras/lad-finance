import { useState } from "react";
import { useFinance } from "../../../state/finance";
import { Button, Notice, RecordList } from "../../../shared/ui";
import { categoryBudgets } from "../../../domain/budgets";
import type { OpenSheet } from "../../../application/navigation/types";
import { BudgetSummary } from "./BudgetSummary";
import { BudgetCard } from "./BudgetCard";

export function BudgetsPanel({
  open,
  full = false,
}: {
  open: OpenSheet;
  full?: boolean;
}) {
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
      <RecordList
        items={categories.filter(
          (category) => !category.archived || category.hasActivity,
        )}
        full={full}
        keyExtractor={(category) => category.id}
        showAllLabel="Все бюджеты"
        onShowAll={() => open({ type: "list", list: "budgets" })}
        testID="budgets-list"
        renderItem={(c) => (
          <BudgetCard
            category={c}
            open={open}
            expanded={expandedId === c.id}
            onToggle={() =>
              setExpandedId(expandedId === c.id ? undefined : c.id)
            }
          />
        )}
      />
    </>
  );
}
