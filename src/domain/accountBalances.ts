import { localDate } from "../shared/lib/dates";
import { receivedAmount } from "./currency";
import type { FinanceState } from "./types";
import { isPostedAt, pendingHolds } from "./transactionStatus";

/** All balances at the same calendar date, including dated adjustments. */
export function accountBalances(state: FinanceState, today = localDate()) {
  const balances = new Map(state.accounts.map((a) => [a.id, a.openingBalance]));
  const add = (id: string, amount: number) =>
    balances.set(id, (balances.get(id) ?? 0) + amount);
  for (const transaction of state.transactions) {
    if (!isPostedAt(transaction, today)) continue;
    add(
      transaction.accountId,
      transaction.type === "income" ? transaction.amount : -transaction.amount,
    );
    if (transaction.type === "transfer" && transaction.toAccountId)
      add(transaction.toAccountId, receivedAmount(transaction));
  }
  for (const adjustment of state.balanceAdjustments ?? [])
    if (adjustment.date <= today) add(adjustment.accountId, adjustment.amount);
  return balances;
}

export const accountBalance = (
  state: FinanceState,
  id: string,
  today = localDate(),
) => accountBalances(state, today).get(id) ?? 0;

export function accountAvailability(
  state: FinanceState,
  id: string,
  today = localDate(),
) {
  const balance = accountBalance(state, id, today);
  const held = pendingHolds(state).get(id) ?? 0;
  return { balance, held, available: balance - held };
}
