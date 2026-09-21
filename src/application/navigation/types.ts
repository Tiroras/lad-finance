import type { Transaction } from "../../domain/types";
import type { CurrencyCode } from "../../domain/currency";

export type Tab = "home" | "transactions" | "plan" | "analytics";
export type SheetName =
  | "transaction"
  | "simulate"
  | "formula"
  | "accounts"
  | "account"
  | "currencies"
  | "settings"
  | "goal"
  | "fund"
  | "recurring"
  | "budget"
  | "payment"
  | "csv"
  | "forecast"
  | "forecastSettings"
  | "income"
  | "categories"
  | "category"
  | "scenarios"
  | "scenario"
  | "export";
export interface SheetState {
  type: SheetName;
  id?: string;
  transactionType?: Transaction["type"];
  date?: string;
  currency?: CurrencyCode;
  accountKind?: "spending" | "savings";
}
export type OpenSheet = (sheet: SheetState) => void;
export type Navigate = (tab: Tab) => void;
