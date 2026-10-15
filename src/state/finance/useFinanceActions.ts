import { useMemo } from "react";
import * as actions from "../../domain/actions";
import type { CsvImportInput } from "../../domain/actions/dataTransfer";
import type { BackupTransportFormat } from "../../domain/dataTransfer";
import type { VerifiedRestoreCandidate } from "../../domain/backupRecovery";
import type { FinanceProfile } from "../../domain/profiles";
import type { CurrencyCode, ExchangeRate } from "../../domain/currency";
import type {
  FinanceState,
  ForecastPreferences,
  ReminderPreferences,
} from "../../domain/types";
import { useFinance, useImportCommit } from "./FinanceProvider";
import { assertDemoAllowed } from "./demoMode";
import { getDraftStorage } from "../../infrastructure/storage/draftStorage";

export function useFinanceActions() {
  const { update, today, profile } = useFinance();
  const commitImport = useImportCommit();
  return useMemo(
    () => ({
      saveDebt: (input: actions.DebtInput) =>
        update((s) => actions.saveDebt(s, input, today)),
      repayDebt: (input: actions.DebtRepaymentInput) =>
        update((s) => actions.repayDebt(s, input, today)),
      deleteDebt: (id: string) => update((s) => actions.deleteDebt(s, id)),
      repayCredit: (input: actions.CreditRepaymentInput) =>
        update((s) => actions.repayCredit(s, input, today)),
      saveBudgetPlan: (input: actions.BudgetPlanInput) =>
        update((s) => actions.saveBudgetPlan(s, input, today)),
      acceptDemo: () => update((s) => actions.acceptDemo(s)),
      completeOnboarding: (input: actions.OnboardingInput) =>
        update((s) => actions.completeOnboarding(s, input, today)),
      reconcileAccount: (input: actions.ReconciliationInput) =>
        update((s) => actions.reconcileAccount(s, input, today)),
      saveCategoryRule: (input: actions.CategoryRuleInput) =>
        update((s) => actions.saveCategoryRule(s, input)),
      deleteCategoryRule: (id: string) =>
        update((s) => actions.deleteCategoryRule(s, id)),
      moveCategoryRule: (id: string, direction: -1 | 1) =>
        update((s) => actions.moveCategoryRule(s, id, direction)),
      saveTransactionTemplate: (input: actions.TransactionTemplateInput) =>
        update((s) => actions.saveTransactionTemplate(s, input)),
      deleteTransactionTemplate: (id: string) =>
        update((s) => actions.deleteTransactionTemplate(s, id)),
      saveCsvProfile: (input: actions.CsvProfileInput) =>
        update((s) => actions.saveCsvProfile(s, input)),
      deleteCsvProfile: (id: string) =>
        update((s) => actions.deleteCsvProfile(s, id)),
      saveCurrencyRate: (currency: CurrencyCode, value: number) =>
        update((s) => actions.saveCurrencyRate(s, currency, value, today)),
      restoreAutomaticRate: (currency: CurrencyCode) =>
        update((s) => actions.restoreAutomaticRate(s, currency, today)),
      mergeCurrencyRates: (
        rates: Partial<Record<CurrencyCode, ExchangeRate>>,
      ) => update((s) => actions.mergeCurrencyRates(s, rates, today)),
      setAutomaticRates: (automatic: boolean) =>
        update((s) => actions.setAutomaticRates(s, automatic)),
      changeBaseCurrency: (currency: CurrencyCode) =>
        update((s) => actions.changeBaseCurrency(s, currency, today)),
      saveCategory: (input: actions.CategoryInput) =>
        update((s) => actions.saveCategory(s, input)),
      setCategoryArchived: (id: string, archived: boolean) =>
        update((s) => actions.setCategoryArchived(s, id, archived)),
      saveScenario: (input: actions.ScenarioInput) =>
        update((s) => actions.saveScenario(s, input)),
      deleteScenario: (id: string) =>
        update((s) => actions.deleteScenario(s, id)),
      saveTransaction: (input: actions.TransactionInput) =>
        update((s) => actions.saveTransaction(s, input, today)),
      deleteTransaction: (id: string) =>
        update((s) => actions.deleteTransaction(s, id, today)),
      postPendingTransaction: (id: string, date: string) =>
        update((s) => actions.postPendingTransaction(s, id, date, today)),
      cancelPendingTransaction: (id: string) =>
        update((s) => actions.cancelPendingTransaction(s, id, today)),
      saveAccount: (input: actions.AccountInput) =>
        update((s) => actions.saveAccount(s, input, today)),
      archiveAccount: (id: string) =>
        update((s) => actions.archiveAccount(s, id, today)),
      restoreAccount: (id: string) =>
        update((s) => actions.restoreAccount(s, id)),
      saveGoal: (input: actions.GoalInput) =>
        update((s) => actions.saveGoal(s, input, today)),
      deleteGoal: (id: string) => update((s) => actions.deleteGoal(s, id)),
      fundGoal: (input: {
        goalId: string;
        amount: number;
        accountId: string;
        toAccountId?: string;
        toAmount?: number;
      }) => update((s) => actions.fundGoal(s, input, today)),
      saveRecurring: (input: actions.RecurringInput) =>
        update((s) => actions.saveRecurring(s, input, today)),
      deleteRecurring: (id: string) =>
        update((s) => actions.deleteRecurring(s, id)),
      setRecurringActive: (id: string, active: boolean) =>
        update((s) => actions.setRecurringActive(s, id, active, today)),
      setPaymentSkipped: (id: string, date: string, skipped: boolean) =>
        update((s) => actions.setPaymentSkipped(s, id, date, skipped, today)),
      payRecurring: (id: string, date: string, transactionId?: string) =>
        update((s) => actions.payRecurring(s, id, date, today, transactionId)),
      saveBudget: (id: string, amount: number) =>
        update((s) => actions.saveBudget(s, id, amount, today)),
      saveSettings: (
        input: Pick<
          FinanceState["settings"],
          "name" | "payday" | "buffer" | "spendableIncomeId"
        >,
      ) => update((s) => actions.saveSettings(s, input)),
      saveReminderPreferences: (patch: Partial<ReminderPreferences>) =>
        update((s) => actions.saveReminderPreferences(s, patch)),
      saveForecastPreferences: (preferences: ForecastPreferences) =>
        update((s) => actions.saveForecastPreferences(s, preferences)),
      savePlannedIncome: (input: actions.IncomeInput) =>
        update((s) => actions.savePlannedIncome(s, input)),
      deletePlannedIncome: (id: string) =>
        update((s) => actions.deletePlannedIncome(s, id)),
      receivePlannedIncome: (
        id: string,
        date: string,
        transactionId?: string,
      ) =>
        update((s) =>
          actions.receivePlannedIncome(s, id, date, today, transactionId),
        ),
      importCsvConfirmed: (
        input: CsvImportInput & {
          operationId: string;
          expectedProfileId: FinanceProfile;
        },
      ) =>
        commitImport({
          operationId: input.operationId,
          expectedProfileId: input.expectedProfileId,
          format: "csv",
          mode: "add",
          apply: (current, date) =>
            actions.applyCsvImportWithSummary(current, input, date),
        }),
      restoreConfirmed: (input: {
        operationId: string;
        expectedProfileId: FinanceProfile;
        candidate: VerifiedRestoreCandidate;
        format: BackupTransportFormat;
      }) =>
        commitImport({
          operationId: input.operationId,
          expectedProfileId: input.expectedProfileId,
          format: input.format,
          mode: "replace",
          apply(current, date) {
            assertDemoAllowed({
              ...input.candidate.state,
              demo: input.candidate.sourceDemo,
            });
            return actions.restoreFinanceWithSummary(
              current,
              input.candidate,
              date,
            );
          },
        }),
      reset: async (demo: boolean) => {
        // The reset confirmation explicitly discards this profile's drafts.
        // Invalidate leases first, including already queued autosaves.
        await getDraftStorage(profile).clearProfile();
        return update((s) => actions.resetFinance(s, demo, today));
      },
    }),
    [update, today, profile, commitImport],
  );
}
