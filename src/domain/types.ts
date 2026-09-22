import type { CurrencyCode, ExchangeSettings } from "./currency";
import type {
  CategoryRule,
  TransactionTemplate,
  CsvSourceProfile,
} from "./automation";
import type {
  BalanceAdjustment,
  AccountReconciliation,
} from "./reconciliation";
import type { RecurrenceSchedule } from "./recurrence";
import type { BudgetPlan } from "./budgets";
import type { Debt } from "./debts";
export type CategoryId = string;
export const ICON_NAMES = [
  "leaf-outline",
  "cafe-outline",
  "car-outline",
  "bag-handle-outline",
  "sparkles-outline",
  "heart-outline",
  "home-outline",
  "grid-outline",
  "airplane-outline",
  "shield-checkmark-outline",
  "wallet-outline",
  "card-outline",
  "cash-outline",
  "musical-notes-outline",
  "cloud-outline",
  "barbell-outline",
  "paper-plane-outline",
  "wifi-outline",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export interface Category {
  id: CategoryId;
  name: string;
  icon: IconName;
  color: string;
  background: string;
  budget: number;
  parentId?: CategoryId;
  archived?: boolean;
}

// Money uses integer minor units of the account/goal currency; summaries use the base currency.
export interface Account {
  id: string;
  name: string;
  kind: "spending" | "savings" | "credit";
  creditLimit?: number;
  paymentDueDate?: string;
  paymentDueAmount?: number;
  paymentDueBaselineIds?: string[];
  openingBalance: number;
  currency?: CurrencyCode;
  icon: IconName;
  color: string;
}

export interface Transaction {
  id: string;
  type: "expense" | "income" | "transfer";
  title: string;
  amount: number;
  date: string;
  category: CategoryId;
  accountId: string;
  toAccountId?: string;
  toAmount?: number;
  baseAmount?: number;
  goalId?: string;
  recurringId?: string;
  occurrenceDate?: string;
  note?: string;
  importKey?: string;
  plannedIncomeId?: string;
  incomeOccurrenceDate?: string;
  splits?: { category: CategoryId; amount: number }[];
  refundOf?: string;
  refundSourceAmount?: number;
  debtId?: string;
  debtAction?: "issue" | "repay";
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  initialSaved: number;
  monthly: number;
  currency?: CurrencyCode;
  icon: IconName;
  color: string;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  day: number;
  kind: "bill" | "subscription";
  active: boolean;
  icon: IconName;
  color: string;
  category: CategoryId;
  accountId: string;
  startsOn?: string;
  skippedMonths?: string[];
  history?: { untilMonth: string; amount: number; day: number }[];
  schedule?: RecurrenceSchedule;
  skippedDates?: string[];
  amountHistory?: { until: string; amount: number }[];
}

export interface ReminderPreferences {
  enabled: boolean;
  daysBefore: 0 | 1 | 3;
  hour: number;
}

export interface PlannedIncome {
  id: string;
  name: string;
  amount: number;
  date: string;
  repeat: "once" | "monthly";
  schedule?: RecurrenceSchedule;
  accountId: string;
}

export interface ForecastPreferences {
  dailySpending: number;
  goalDay: number;
}

export interface FinanceState {
  version: 2 | 3 | 4;
  demo: boolean;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  goals: Goal[];
  recurring: Recurring[];
  plannedIncomes?: PlannedIncome[];
  scenarios?: SavedScenario[];
  categoryRules?: CategoryRule[];
  transactionTemplates?: TransactionTemplate[];
  csvProfiles?: CsvSourceProfile[];
  balanceAdjustments?: BalanceAdjustment[];
  reconciliations?: AccountReconciliation[];
  budgetPlans?: BudgetPlan[];
  debts?: Debt[];
  settings: {
    name: string;
    payday: number;
    spendableIncomeId?: string;
    onboardingCompleted?: boolean;
    buffer: number;
    baseCurrency?: CurrencyCode;
    exchange?: ExchangeSettings;
    reminders?: ReminderPreferences;
    forecast?: ForecastPreferences;
  };
}

export interface ScenarioChange {
  currency?: CurrencyCode;
  source: "income" | "payment" | "goal";
  sourceId: string;
  name: string;
  amount: number;
  delayDays: number;
}

export interface ScenarioEvent {
  id: string;
  name: string;
  type: "income" | "expense";
  amount: number;
  date: string;
}

export interface SavedScenario {
  id: string;
  name: string;
  horizon: 30 | 60 | 90;
  dailySpending?: number;
  changes: ScenarioChange[];
  events: ScenarioEvent[];
}

export interface Occurrence {
  payment: Recurring;
  date: string;
  paid: boolean;
  skipped?: boolean;
}
