import type { CurrencyCode, ExchangeSettings } from "./currency";
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
  kind: "spending" | "savings";
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
  accountId: string;
}

export interface ForecastPreferences {
  dailySpending: number;
  goalDay: number;
}

export interface FinanceState {
  version: 2 | 3;
  demo: boolean;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  goals: Goal[];
  recurring: Recurring[];
  plannedIncomes?: PlannedIncome[];
  scenarios?: SavedScenario[];
  settings: {
    name: string;
    payday: number;
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
