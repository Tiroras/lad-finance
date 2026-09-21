import { MAX_MONEY } from "./finance";
import type { ForecastResult } from "./forecast";

/** A purchase must preserve the reserve on every day of this horizon. */
export function planPurchase(
  baseline: ForecastResult,
  amount: number,
  date: string,
) {
  const index = baseline.days.findIndex((d) => d.date === date);
  if (index < 0) throw new Error("Дата покупки вне периода прогноза.");
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MONEY)
    throw new Error("Укажите корректную стоимость покупки.");
  const limits = new Array<number>(baseline.days.length);
  let lowest = Infinity;
  let limitingDay = baseline.days[index];
  for (let i = baseline.days.length - 1; i >= 0; i--) {
    lowest = Math.min(lowest, baseline.days[i].balance);
    limits[i] = Math.max(0, Math.min(MAX_MONEY, lowest - baseline.buffer));
    if (i >= index && baseline.days[i].balance <= limitingDay.balance)
      limitingDay = baseline.days[i];
  }
  const feasible = !baseline.firstBelowBuffer;
  return {
    maximum: feasible ? limits[index] : 0,
    earliest:
      feasible && amount > 0
        ? baseline.days.find((_, i) => limits[i] >= amount)?.date
        : undefined,
    limitingDay,
    existingShortfall: baseline.firstBelowBuffer,
    through: baseline.days[baseline.days.length - 1].date,
  };
}
