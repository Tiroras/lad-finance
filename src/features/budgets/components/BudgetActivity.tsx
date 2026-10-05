import { View } from "react-native";
import { budgetActivity } from "../../../domain/budgets";
import { dateLabel, shiftDate } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import { C, font, Txt } from "../../../shared/ui";
import { TransactionEvidence } from "../../transactions";

export function BudgetActivity({
  categoryId,
  open,
}: {
  categoryId: string;
  open: OpenSheet;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const activity = budgetActivity(state, categoryId, today, today);
  const fullDate = (date: string) =>
    dateLabel(date, { day: "numeric", month: "long", year: "numeric" });
  return (
    <View
      testID={`budget-activity-${categoryId}`}
      style={{ paddingHorizontal: 17, paddingBottom: 17, gap: 12 }}
    >
      <Txt style={{ fontFamily: font.semibold, fontSize: 13 }}>
        Итого за период: {money(activity.spent, true)}
      </Txt>
      <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
        {fullDate(activity.start)} — {fullDate(shiftDate(activity.end, -1))}
      </Txt>
      <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
        Учтены записи по {dateLabel(today)}. Подкатегории включены. Возвраты
        уменьшают расходы.
      </Txt>
      <TransactionEvidence
        key={`${activity.start}-${activity.end}`}
        transactions={activity.transactions}
        contributionLabel="в этом бюджете"
        precise
        incremental
        onOpen={(id) => open({ type: "transaction", id })}
      />
    </View>
  );
}
