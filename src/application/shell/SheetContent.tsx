import { memo } from "react";
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
  DeleteDataConfirmation,
  ImportResults,
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
import { ListPageContent } from "./ListPageContent";

export const SheetContent = memo(function SheetContent({
  sheet,
  close,
  back,
  open,
  returnToGuide,
  returnToList,
  startTour,
}: {
  sheet: SheetState | null;
  close: () => void;
  back?: () => void;
  open: OpenSheet;
  returnToGuide?: () => void;
  returnToList?: () => void;
  startTour: (id?: string) => void;
}) {
  if (!sheet) return null;
  switch (sheet.type) {
    case "list":
      return <ListPageContent sheet={sheet} open={open} />;
    case "debt":
      return (
        <DebtForm
          id={sheet.id}
          open={open}
          close={returnToList ?? (() => open({ type: "accounts" }))}
        />
      );
    case "repayDebt":
      return (
        <DebtRepaymentForm
          open={open}
          id={sheet.id}
          close={returnToList ?? (() => open({ type: "accounts" }))}
        />
      );
    case "repayCredit":
      return (
        <CreditRepaymentForm
          open={open}
          id={sheet.id}
          close={returnToList ?? (() => open({ type: "accounts" }))}
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
      return <AppGuide close={close} onStart={startTour} />;
    case "automation":
      return <AutomationSettings open={open} />;
    case "reconcile":
      return (
        <ReconciliationForm
          id={sheet.id}
          close={returnToList ?? (() => open({ type: "accounts" }))}
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
          close={returnToList ?? (() => open({ type: "categories" }))}
        />
      );
    case "scenarios":
      return <ScenariosPanel open={open} />;
    case "scenario":
      return (
        <ScenarioForm id={sheet.id} close={() => open({ type: "scenarios" })} />
      );
    case "transaction":
      return (
        <TransactionForm
          sheet={sheet}
          close={returnToGuide ?? returnToList ?? close}
          open={open}
        />
      );
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
          close={returnToGuide ?? returnToList ?? close}
          defaultCurrency={sheet.currency}
          defaultKind={sheet.accountKind}
          onArchiveChange={returnToList}
          open={open}
        />
      );
    case "settings":
      return <SettingsMenu open={open} />;
    case "profiles":
      return <ProfilesSettings close={close} open={open} />;
    case "deleteData":
      return (
        <DeleteDataConfirmation
          profileId={sheet.profileId}
          cancel={back ?? close}
        />
      );
    case "profileSettings":
      return (
        <SettingsForm
          close={returnToGuide ?? (() => open({ type: "settings" }))}
        />
      );
    case "reminderSettings":
      return <ReminderSettings />;
    case "securitySettings":
      return <SecuritySettings />;
    case "dataSettings":
      return <DataSettings close={close} open={open} />;
    case "about":
      return <AboutSettings />;
    case "csv":
      return <CsvImportSheet open={open} />;
    case "importResult":
      return <ImportResults id={sheet.id} />;
    case "forecast":
      return <ForecastPanel open={open} />;
    case "forecastSettings":
      return <ForecastSettingsForm close={() => open({ type: "forecast" })} />;
    case "income":
      return (
        <IncomePlanForm
          sheet={sheet}
          close={
            returnToGuide ?? returnToList ?? (() => open({ type: "forecast" }))
          }
          open={open}
        />
      );
    case "goal":
      return <GoalForm id={sheet.id} close={returnToList ?? close} />;
    case "fund":
      return (
        <FundGoalForm id={sheet.id} close={returnToList ?? close} open={open} />
      );
    case "recurring":
      return (
        <RecurringForm
          open={open}
          id={sheet.id}
          sourceTransactionId={sheet.sourceTransactionId}
          close={returnToGuide ?? returnToList ?? close}
        />
      );
    case "budget":
      return <BudgetForm id={sheet.id} close={returnToList ?? close} />;
    case "payment":
      return (
        <PaymentContent
          sheet={sheet}
          close={returnToList ?? close}
          open={open}
        />
      );
  }
});
