import { localDate } from "../shared/lib/dates";
import { receivedAmount } from "./currency";
import type { FinanceState } from "./types";

export function accountBalance(
  state: FinanceState,
  id: string,
  today = localDate(),
) {
  return state.transactions
    .filter((t) => t.date <= today)
    .reduce(
      (sum, t) => {
        if (t.accountId === id)
          sum += t.type === "income" ? t.amount : -t.amount;
        if (t.type === "transfer" && t.toAccountId === id)
          sum += receivedAmount(t);
        return sum;
      },
      (state.accounts.find((a) => a.id === id)?.openingBalance ?? 0) +
        (state.balanceAdjustments ?? [])
          .filter(
            (adjustment) =>
              adjustment.accountId === id && adjustment.date <= today,
          )
          .reduce((sum, adjustment) => sum + adjustment.amount, 0),
    );
}
