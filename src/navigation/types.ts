import type { Transaction } from "../domain/types";

export type Tab = "home" | "transactions" | "plan" | "analytics";
export type SheetName =
  | "transaction"
  | "simulate"
  | "formula"
  | "accounts"
  | "account"
  | "settings"
  | "goal"
  | "fund"
  | "recurring"
  | "budget"
  | "payment"
  | "csv";
export interface SheetState {
  type: SheetName;
  id?: string;
  transactionType?: Transaction["type"];
  date?: string;
}
export type OpenSheet = (sheet: SheetState) => void;
export type Navigate = (tab: Tab) => void;
