import type { CurrencyCode } from "../currency";
import { currencyRate } from "../currency";
import { createInitialState } from "../seed";
import { promoteFinanceVersion } from "../financeVersion";
import { canStartOnboarding } from "../onboarding";
import type { FinanceState } from "../types";
import { localDate, validDate } from "../../shared/lib/dates";
import { savePlannedIncome } from "./incomes";
import { saveRecurring } from "./recurring";
import {
  checkAmount,
  checkName,
  checkCurrencyAmounts,
  checkSavings,
  ensure,
} from "./validation";

export interface OnboardingInput {
  name: string;
  accountName: string;
  currency: CurrencyCode;
  balance: number;
  savings: number;
  buffer: number;
  incomeName: string;
  incomeAmount: number;
  incomeDate: string;
  billName: string;
  billAmount: number;
  billDate: string;
}

export function acceptDemo(state: FinanceState): FinanceState {
  ensure(state.demo, "Демонстрационный учёт не открыт.");
  return {
    ...state,
    settings: { ...state.settings, onboardingCompleted: true },
  };
}

export function completeOnboarding(
  state: FinanceState,
  input: OnboardingInput,
  today = localDate(),
): FinanceState {
  ensure(
    canStartOnboarding(state),
    "Собственный учёт уже начат. Измените счета и планы в соответствующих разделах.",
  );
  ensure(
    input.name.trim().length <= 40,
    "Имя должно быть не длиннее 40 символов.",
  );
  checkName(input.accountName);
  for (const amount of [
    input.balance,
    input.savings,
    input.buffer,
    input.incomeAmount,
    input.billAmount,
  ])
    checkAmount(amount, true);
  currencyRate(state, input.currency);
  let next = createInitialState(false, today);
  next = {
    ...next,
    version: promoteFinanceVersion(state.version, next.version),
    accounts: next.accounts.map((a) => ({
      ...a,
      currency: input.currency,
      name: a.id === "card" ? input.accountName.trim() : a.name,
      openingBalance:
        a.id === "card"
          ? input.balance
          : a.id === "savings"
            ? input.savings
            : 0,
    })),
    settings: {
      ...next.settings,
      name: input.name.trim(),
      baseCurrency: input.currency,
      exchange: state.settings.exchange,
      buffer: input.buffer,
      onboardingCompleted: true,
    },
  };
  if (input.incomeAmount > 0) {
    ensure(
      validDate(input.incomeDate) && input.incomeDate >= today,
      "Первая дата дохода должна быть сегодня или позднее.",
    );
    next = savePlannedIncome(next, {
      name: input.incomeName,
      amount: input.incomeAmount,
      date: input.incomeDate,
      repeat: "monthly",
      accountId: "card",
    });
    next = {
      ...next,
      settings: {
        ...next.settings,
        payday: Number(input.incomeDate.slice(-2)),
      },
    };
  }
  if (input.billAmount > 0) {
    ensure(
      validDate(input.billDate) && input.billDate >= today,
      "Первая дата платежа должна быть сегодня или позднее.",
    );
    next = saveRecurring(
      next,
      {
        name: input.billName,
        amount: input.billAmount,
        day: Number(input.billDate.slice(-2)),
        category: "home",
        accountId: "card",
        startsOn: input.billDate,
      },
      today,
    );
  }
  checkCurrencyAmounts(next, today);
  checkSavings(next, today);
  return next;
}
