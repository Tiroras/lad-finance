import { CsvImportSheet } from "../features/import/CsvImportSheet";
import type { SheetState, OpenSheet } from "../navigation/types";
import {
  TransactionForm,
  FormulaContent,
  Simulator,
  AccountsContent,
  AccountForm,
  BudgetForm,
  GoalForm,
  FundGoalForm,
  RecurringForm,
  PaymentContent,
  SettingsForm,
} from "../forms";

export function SheetContent({
  sheet,
  close,
  open,
}: {
  sheet: SheetState | null;
  close: () => void;
  open: OpenSheet;
}) {
  if (!sheet) return null;
  switch (sheet.type) {
    case "transaction":
      return <TransactionForm sheet={sheet} close={close} />;
    case "formula":
      return <FormulaContent />;
    case "simulate":
      return <Simulator />;
    case "accounts":
      return <AccountsContent open={open} />;
    case "account":
      return <AccountForm id={sheet.id} close={close} />;
    case "settings":
      return <SettingsForm close={close} open={open} />;
    case "csv":
      return <CsvImportSheet close={close} />;
    case "goal":
      return <GoalForm id={sheet.id} close={close} />;
    case "fund":
      return <FundGoalForm id={sheet.id} close={close} open={open} />;
    case "recurring":
      return <RecurringForm id={sheet.id} close={close} />;
    case "budget":
      return <BudgetForm id={sheet.id} close={close} />;
    case "payment":
      return <PaymentContent sheet={sheet} close={close} open={open} />;
  }
}
