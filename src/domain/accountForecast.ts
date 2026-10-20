import type { FinanceState, Account } from "./types";
import type { ForecastDay } from "./forecast";
import { accountBalances } from "./accountBalances";
import { accountToBase, accountCurrency, type CurrencyCode } from "./currency";
import { pendingHolds } from "./transactionStatus";

export interface ForecastLeg {
  accountId: string;
  /** Signed amount in the account's own minor units. */
  amount: number;
  releaseHeld?: number;
}

export interface AccountForecastDay {
  date: string;
  balance: number;
  held: number;
  available: number;
}

export interface AccountForecast {
  accountId: string;
  name: string;
  kind: Account["kind"];
  currency: CurrencyCode;
  days: AccountForecastDay[];
  minimum: AccountForecastDay;
  firstShortfall?: AccountForecastDay;
  openingBalance: number;
  openingHeld: number;
}

/** Native-currency trajectories. A credit limit is never added to a balance. */
export function forecastAccounts(
  state: FinanceState,
  days: ForecastDay[],
  today: string,
): AccountForecast[] {
  const balances = accountBalances(state, today);
  const holds = pendingHolds(state);
  return state.accounts.map((account) => {
    const openingBalance = balances.get(account.id) ?? 0;
    const openingHeld = holds.get(account.id) ?? 0;
    let balance = openingBalance;
    let held = openingHeld;
    const trajectory = days.map((day) => {
      for (const event of day.events)
        for (const leg of event.legs ?? [])
          if (leg.accountId === account.id) {
            balance += leg.amount;
            held -= leg.releaseHeld ?? 0;
          }
      if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(held))
        throw new Error("Остаток прогноза превышает безопасный целый предел.");
      return { date: day.date, balance, held, available: balance - held };
    });
    return {
      accountId: account.id,
      name: account.name,
      kind: account.kind,
      currency: accountCurrency(state, account.id),
      days: trajectory,
      openingBalance,
      openingHeld,
      minimum: trajectory.reduce((min, day) =>
        day.available < min.available ? day : min,
      ),
      // A negative credit balance is debt, not missing own cash.
      firstShortfall:
        account.kind === "credit"
          ? undefined
          : trajectory.find((day) => day.available < 0),
    };
  });
}

export function spendingLegAmount(state: FinanceState, legs: ForecastLeg[]) {
  return legs.reduce(
    (total, leg) =>
      total +
      (state.accounts.find((account) => account.id === leg.accountId)?.kind ===
      "spending"
        ? accountToBase(state, leg.amount, leg.accountId)
        : 0),
    0,
  );
}
