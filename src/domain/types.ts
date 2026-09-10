export type CategoryId = 'groceries' | 'cafe' | 'transport' | 'shopping' | 'fun' | 'health' | 'home' | 'other';
export type IconName = 'leaf-outline' | 'cafe-outline' | 'car-outline' | 'bag-handle-outline' | 'sparkles-outline' | 'heart-outline' | 'home-outline' | 'grid-outline' | 'airplane-outline' | 'shield-checkmark-outline' | 'wallet-outline' | 'card-outline' | 'cash-outline' | 'musical-notes-outline' | 'cloud-outline' | 'barbell-outline' | 'paper-plane-outline' | 'wifi-outline';

export interface Category {
  id: CategoryId;
  name: string;
  icon: IconName;
  color: string;
  background: string;
  budget: number;
}

// All monetary values are integer kopecks. Dates are local calendar dates.
export interface Account {
  id: string;
  name: string;
  kind: 'spending' | 'savings';
  openingBalance: number;
  icon: IconName;
  color: string;
}

export interface Transaction {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  title: string;
  amount: number;
  date: string;
  category: CategoryId;
  accountId: string;
  toAccountId?: string;
  goalId?: string;
  recurringId?: string;
  occurrenceDate?: string;
  note?: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  initialSaved: number;
  monthly: number;
  icon: IconName;
  color: string;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  day: number;
  kind: 'bill' | 'subscription';
  active: boolean;
  icon: IconName;
  color: string;
  category: CategoryId;
  accountId: string;
}

export interface FinanceState {
  version: 1;
  demo: boolean;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  goals: Goal[];
  recurring: Recurring[];
  settings: { name: string; payday: number; buffer: number };
}

export interface Occurrence { payment: Recurring; date: string; paid: boolean }
