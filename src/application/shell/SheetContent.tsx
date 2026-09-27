import { CategoriesPanel, CategoryForm } from "../../features/categories";
import { CurrencySettings } from "../../features/currencies";
import {
  DebtForm,
  DebtRepaymentForm,
  CreditRepaymentForm,
  DebtsPanel,
} from "../../features/debts";
import {
  CsvExportSheet,
  CsvImportSheet,
  DataSettings,
} from "../../features/data-transfer";
import {
  ForecastPanel,
  ForecastSettingsForm,
  FormulaContent,
  Simulator,
} from "../../features/forecast";
import { IncomePlanForm } from "../../features/incomes";
import { ScenarioForm, ScenariosPanel } from "../../features/scenarios";
import {
  AccountForm,
  AccountsContent,
  ReconciliationForm,
} from "../../features/accounts";
import { BudgetForm } from "../../features/budgets";
import { FundGoalForm, GoalForm } from "../../features/goals";
import {
  PaymentContent,
  RecurringForm,
  ReminderSettings,
} from "../../features/payments";
import {
  SettingsForm,
  SettingsMenu,
  ProfilesSettings,
  AboutSettings,
  OnboardingFlow,
  AppGuide,
} from "../../features/settings";
import { SecuritySettings } from "../../features/security";
import {
  TransactionForm,
  AutomationSettings,
} from "../../features/transactions";
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
    case "debt":
      return (
        <DebtForm id={sheet.id} close={() => open({ type: "accounts" })} />
      );
    case "repayDebt":
      return (
        <DebtRepaymentForm
          id={sheet.id}
          close={() => open({ type: "accounts" })}
        />
      );
    case "repayCredit":
      return (
        <CreditRepaymentForm
          id={sheet.id}
          close={() => open({ type: "accounts" })}
        />
      );
    case "onboarding":
      return (
        <OnboardingFlow
          close={close}
          startWithAccounts={sheet.startWithAccounts}
        />
      );
    case "guide":
      return <AppGuide close={close} />;
    case "automation":
      return <AutomationSettings />;
    case "reconcile":
      return (
        <ReconciliationForm
          id={sheet.id}
          close={() => open({ type: "accounts" })}
          open={open}
        />
      );
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
      return (
        <>
          <AccountsContent open={open} />
          <DebtsPanel open={open} />
        </>
      );
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
      return <SettingsMenu open={open} />;
    case "profiles":
      return <ProfilesSettings close={close} />;
    case "profileSettings":
      return <SettingsForm close={() => open({ type: "settings" })} />;
    case "reminderSettings":
      return <ReminderSettings />;
    case "securitySettings":
      return <SecuritySettings />;
    case "dataSettings":
      return <DataSettings close={close} open={open} />;
    case "about":
      return <AboutSettings />;
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
      return (
        <RecurringForm
          id={sheet.id}
          sourceTransactionId={sheet.sourceTransactionId}
          close={close}
        />
      );
    case "budget":
      return <BudgetForm id={sheet.id} close={close} />;
    case "payment":
      return <PaymentContent sheet={sheet} close={close} open={open} />;
  }
}
