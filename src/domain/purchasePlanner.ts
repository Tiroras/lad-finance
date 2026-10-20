import { MAX_MONEY } from "./finance";
import type { ForecastResult } from "./forecast";
import type { FinanceState } from "./types";
import { accountToBase } from "./currency";

/** A purchase must preserve the reserve on every day of this horizon. */
export function planPurchase(
  baseline: ForecastResult,
  amount: number,
  date: string,
  account?: { state: FinanceState; accountId: string },
) {
  const index = baseline.days.findIndex((d) => d.date === date);
  if (index < 0) throw new Error("Дата покупки вне периода прогноза.");
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MONEY)
    throw new Error("Укажите корректную стоимость покупки.");
  const limits = new Array<number>(baseline.days.length);
  let lowest = Infinity;
  let limitingDay = baseline.days[index];
  for (let i = baseline.days.length - 1; i >= 0; i--) {
    lowest = Math.min(lowest, baseline.days[i].available);
    limits[i] = Math.max(0, Math.min(MAX_MONEY, lowest - baseline.buffer));
    if (i >= index && baseline.days[i].available <= limitingDay.available)
      limitingDay = baseline.days[i];
  }
  const selected = account
    ? baseline.accounts.find((entry) => entry.accountId === account.accountId)
    : undefined;
  if (account && (!selected || selected.kind !== "spending"))
    throw new Error("Для покупки выберите повседневный счёт.");
  const unallocated = !!account && baseline.unallocatedEvents.length > 0;
  const uncertain = !!account && (unallocated || baseline.warnings.length > 0);
  const feasible =
    !baseline.firstBelowBuffer && !selected?.firstShortfall && !uncertain;
  let lowestAccountLimit = Infinity;
  if (account && selected)
    for (let i = baseline.days.length - 1; i >= 0; i--) {
      const nativeBalance = selected.days[i].available;
      const valuedBalance = accountToBase(
        account.state,
        nativeBalance,
        account.accountId,
      );
      let lower = 0;
      let upper = Math.max(0, Math.min(MAX_MONEY, nativeBalance));
      // Revalue the remaining native balance, exactly as forecast does. Rounding
      // the purchase in isolation can differ by one base minor unit.
      while (lower < upper) {
        const middle = lower + Math.ceil((upper - lower) / 2);
        const debit = baseline.accountBased
          ? valuedBalance -
            accountToBase(
              account.state,
              nativeBalance - middle,
              account.accountId,
            )
          : accountToBase(account.state, middle, account.accountId);
        if (baseline.days[i].available - debit >= baseline.buffer)
          lower = middle;
        else upper = middle - 1;
      }
      lowestAccountLimit = Math.min(lowestAccountLimit, lower);
      limits[i] = lowestAccountLimit;
    }
  return {
    maximum: feasible ? limits[index] : 0,
    earliest:
      feasible && amount > 0
        ? baseline.days.find((_, i) => limits[i] >= amount)?.date
        : undefined,
    limitingDay,
    existingShortfall: baseline.firstBelowBuffer,
    through: baseline.days[baseline.days.length - 1].date,
    unallocated,
    warnings: account ? baseline.warnings : [],
    accountShortfall: selected?.firstShortfall,
    accountMinimum: selected?.days
      .slice(index)
      .reduce((minimum, day) =>
        day.available < minimum.available ? day : minimum,
      ),
  };
}
