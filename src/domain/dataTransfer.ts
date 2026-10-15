import { accountBalances } from "./accountBalances";
import { accountCurrency, type CurrencyCode } from "./currency";
import { validDate } from "./finance";
import type { Account, FinanceState } from "./types";

export type BackupTransportFormat =
  "json" | "password-v1" | "rescue-v2" | "password-v2";

export interface FinanceSnapshotSummary {
  readonly asOf: string;
  readonly counts: {
    readonly accounts: number;
    readonly transactions: number;
    readonly categories: number;
    readonly goals: number;
    readonly recurring: number;
    readonly plannedIncomes: number;
    readonly scenarios: number;
    readonly debts: number;
    readonly budgetPlans: number;
    readonly balanceAdjustments: number;
    readonly reconciliations: number;
    readonly categoryRules: number;
    readonly transactionTemplates: number;
    readonly csvProfiles: number;
  };
  readonly balances: readonly {
    readonly accountId: string;
    readonly name: string;
    readonly kind: Account["kind"];
    readonly currency: CurrencyCode;
    readonly balance: number;
  }[];
}

export interface ImportSummary {
  readonly before: FinanceSnapshotSummary | null;
  readonly beforeStatus: "known" | "unknown" | "new-profile";
  readonly after: FinanceSnapshotSummary;
  readonly csv?: {
    readonly sourceRows: number;
    readonly added: number;
    readonly skipped: {
      readonly invalid: number;
      readonly duplicate: number;
      readonly excluded: number;
    };
  };
}

export interface ImportApplication {
  state: FinanceState;
  summary: ImportSummary;
}

/** Detached result values; no financial state references escape into the UI. */
export function buildFinanceSnapshotSummary(
  state: FinanceState,
  today: string,
): FinanceSnapshotSummary {
  if (!validDate(today))
    throw new Error("Не удалось определить дату результата.");
  const balances = accountBalances(state, today);
  return {
    asOf: today,
    counts: {
      accounts: state.accounts.length,
      transactions: state.transactions.length,
      categories: state.categories.length,
      goals: state.goals.length,
      recurring: state.recurring.length,
      plannedIncomes: state.plannedIncomes?.length ?? 0,
      scenarios: state.scenarios?.length ?? 0,
      debts: state.debts?.length ?? 0,
      budgetPlans: state.budgetPlans?.length ?? 0,
      balanceAdjustments: state.balanceAdjustments?.length ?? 0,
      reconciliations: state.reconciliations?.length ?? 0,
      categoryRules: state.categoryRules?.length ?? 0,
      transactionTemplates: state.transactionTemplates?.length ?? 0,
      csvProfiles: state.csvProfiles?.length ?? 0,
    },
    balances: state.accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      kind: account.kind,
      currency: accountCurrency(state, account.id),
      balance: balances.get(account.id) ?? 0,
    })),
  };
}

export function buildReplacementImportSummary(
  before: FinanceState | null,
  after: FinanceState,
  today: string,
  destination: "existing-profile" | "new-profile" = "existing-profile",
): ImportSummary {
  return {
    before:
      destination === "new-profile" || before === null
        ? null
        : buildFinanceSnapshotSummary(before, today),
    beforeStatus:
      destination === "new-profile"
        ? "new-profile"
        : before === null
          ? "unknown"
          : "known",
    after: buildFinanceSnapshotSummary(after, today),
  };
}
