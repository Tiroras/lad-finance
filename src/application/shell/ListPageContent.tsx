import { View } from "react-native";
import type { OpenSheet, SheetOf } from "../navigation/types";
import { useFinance } from "../../state/finance";
import { dateLabel, monthKey, shiftDate } from "../../shared/lib/dates";
import { C, Txt } from "../../shared/ui";
import { AccountsContent } from "../../features/accounts";
import { BudgetsPanel } from "../../features/budgets";
import { DebtsPanel } from "../../features/debts";
import { GoalsPanel } from "../../features/goals";
import { IncomePlans } from "../../features/incomes";
import { CategoryBreakdown, SpendingComparison } from "../../features/insights";
import { PaymentAgenda, RecurringPaymentsList } from "../../features/payments";
import {
  CategoryRulesPanel,
  TemplateManager,
} from "../../features/transactions";

export function ListPageContent({
  sheet,
  open,
}: {
  sheet: SheetOf<"list">;
  open: OpenSheet;
}) {
  const { today } = useFinance();
  const month = sheet.month ?? monthKey(today);
  const content = (() => {
    switch (sheet.list) {
      case "paymentAgenda":
        return <PaymentAgenda open={open} full />;
      case "recurring":
        return <RecurringPaymentsList open={open} full />;
      case "goals":
        return <GoalsPanel open={open} full />;
      case "budgets":
        return <BudgetsPanel open={open} full />;
      case "incomes":
        return <IncomePlans open={open} full />;
      case "accounts":
        return <AccountsContent open={open} full section="active" />;
      case "archivedAccounts":
        return <AccountsContent open={open} full section="archived" />;
      case "negativeAccounts":
        return <AccountsContent open={open} full section="negative" />;
      case "debts":
        return <DebtsPanel open={open} full section="debts" />;
      case "creditCards":
        return <DebtsPanel open={open} full section="creditCards" />;
      case "spendingCategories":
        return <CategoryBreakdown open={open} month={month} full />;
      case "spendingChanges":
        return <SpendingComparison open={open} month={month} full />;
      case "categoryRules":
        return <CategoryRulesPanel open={open} full />;
      case "templates":
        return <TemplateManager open={open} full />;
    }
  })();
  return (
    <View testID={`list-page-${sheet.list}`} style={{ gap: 20 }}>
      {(sheet.list === "spendingCategories" ||
        sheet.list === "spendingChanges") && (
        <Txt style={{ color: C.muted }}>
          {dateLabel(`${month}-01`, { month: "long", year: "numeric" })}
        </Txt>
      )}
      {sheet.list === "paymentAgenda" && (
        <Txt style={{ color: C.muted }}>
          {dateLabel(today)} — {dateLabel(shiftDate(today, 30))} и неоплаченные
          просрочки.
        </Txt>
      )}
      {content}
    </View>
  );
}
