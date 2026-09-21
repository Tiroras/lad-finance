import { CategoriesPanel } from "../features/categories/CategoriesPanel";
import { CategoryForm } from "../features/categories/CategoryForm";
import { CurrencySettings } from "../features/currencies/CurrencySettings";
import { CsvExportSheet } from "../features/export/CsvExportSheet";
import { ForecastPanel } from "../features/forecast/ForecastPanel";
import { ForecastSettingsForm } from "../features/forecast/ForecastSettingsForm";
import { IncomePlanForm } from "../features/forecast/IncomePlanForm";
import { CsvImportSheet } from "../features/import/CsvImportSheet";
import { ScenarioForm } from "../features/scenarios/ScenarioForm";
import { ScenariosPanel } from "../features/scenarios/ScenariosPanel";
import {
  AccountForm,
  AccountsContent,
  BudgetForm,
  FormulaContent,
  FundGoalForm,
  GoalForm,
  PaymentContent,
  RecurringForm,
  SettingsForm,
  Simulator,
  TransactionForm,
} from "../forms";
import type { OpenSheet, SheetState } from "../navigation/types";

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
    case "currencies":
      return <CurrencySettings />;
    case "export":
      return <CsvExportSheet />;
    case "categories":
      return <CategoriesPanel open={open} />;
    case "category":
      return (
        <CategoryForm
          id={sheet.id}
          close={() => open({ type: "categories" })}
        />
      );
    case "scenarios":
      return <ScenariosPanel open={open} />;
    case "scenario":
      return (
        <ScenarioForm id={sheet.id} close={() => open({ type: "scenarios" })} />
      );
    case "transaction":
      return <TransactionForm sheet={sheet} close={close} />;
    case "formula":
      return <FormulaContent />;
    case "simulate":
      return <Simulator />;
    case "accounts":
      return <AccountsContent open={open} />;
    case "account":
      return (
        <AccountForm
          id={sheet.id}
          close={close}
          defaultCurrency={sheet.currency}
          defaultKind={sheet.accountKind}
        />
      );
    case "settings":
      return <SettingsForm close={close} open={open} />;
    case "csv":
      return <CsvImportSheet close={close} />;
    case "forecast":
      return <ForecastPanel open={open} />;
    case "forecastSettings":
      return <ForecastSettingsForm close={() => open({ type: "forecast" })} />;
    case "income":
      return (
        <IncomePlanForm
          sheet={sheet}
          close={() => open({ type: "forecast" })}
          open={open}
        />
      );
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
