import { baseCurrency, type CurrencyCode } from "../../../domain/currency";
import { daysBetween } from "../../../domain/finance";
import { useFinance } from "../../../state/finance";
import { Notice } from "../../../shared/ui";

export function CurrencyNotice() {
  const { state, today } = useFinance();
  const currencies = new Set<CurrencyCode>([
    baseCurrency(state),
    ...state.accounts.map((a) => a.currency ?? ("RUB" as const)),
    ...state.goals.map((g) => g.currency ?? ("RUB" as const)),
  ]);
  currencies.delete("RUB");
  if (!currencies.size) return null;
  const rates = [...currencies].map((code) => ({
    code,
    rate: state.settings.exchange?.rates[code],
  }));
  const stale = rates.some(
    ({ rate }) => rate && daysBetween(rate.date, today) > 7,
  );
  return (
    <Notice tone={stale ? "warning" : undefined}>
      Общие суммы — в {baseCurrency(state)}, по сохранённым курсам.{" "}
      {rates
        .map(
          ({ code, rate }) =>
            `${code}: ${rate?.date ?? "нет курса"}${rate?.source === "manual" ? " (вручную)" : ""}`,
        )
        .join(" · ")}
      .{stale ? " Курсы старше недели: обновите их в настройках валют." : ""}
    </Notice>
  );
}
