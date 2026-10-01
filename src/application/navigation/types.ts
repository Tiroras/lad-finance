import type { Transaction } from "../../domain/types";
import type { CurrencyCode } from "../../domain/currency";
import type { LessonId } from "../../features/settings";

export type Tab = "home" | "transactions" | "plan" | "analytics";
type SimpleSheetName =
  | "automation"
  | "simulate"
  | "formula"
  | "accounts"
  | "currencies"
  | "settings"
  | "profiles"
  | "profileSettings"
  | "reminderSettings"
  | "securitySettings"
  | "dataSettings"
  | "about"
  | "csv"
  | "forecast"
  | "forecastSettings"
  | "categories"
  | "scenarios"
  | "export";
export type SheetState =
  | { type: SimpleSheetName }
  | { type: "guide"; journey?: boolean; lesson?: LessonId }
  | { type: "onboarding"; startWithAccounts?: boolean }
  | { type: "debt" | "goal" | "category" | "scenario"; id?: string }
  | {
      type: "reconcile" | "repayDebt" | "repayCredit" | "fund" | "budget";
      id: string;
    }
  | { type: "transaction"; id?: string; transactionType?: Transaction["type"] }
  | {
      type: "account";
      id?: string;
      currency?: CurrencyCode;
      accountKind?: "spending" | "savings" | "credit";
    }
  | {
      type: "recurring";
      id?: string;
      sourceTransactionId?: string;
      kind?: "bill" | "subscription";
    }
  | { type: "income"; id?: string; date?: string }
  | { type: "payment"; id: string; date: string };
export type SheetName = SheetState["type"];
export type SheetOf<T extends SheetName> = SheetState & { type: T };
export type OpenSheet = (sheet: SheetState) => void;
export type Navigate = (tab: Tab) => void;
