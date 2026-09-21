import { useMemo } from "react";
import { forecast, type ForecastHorizon } from "../../../domain/forecast";
import { useFinance } from "../../../state/finance";
import { C, font, Txt } from "../../../shared/ui";
import { ForecastResultView } from "./ForecastResultView";

export function PurchaseForecast({
  amount,
  date,
  horizon,
}: {
  amount: number;
  date: string;
  horizon: ForecastHorizon;
}) {
  const { state, today } = useFinance();
  const baseline = useMemo(
    () => forecast(state, horizon, today),
    [state, horizon, today],
  );
  const result = useMemo(
    () => forecast(state, horizon, today, { amount, date }),
    [state, horizon, today, amount, date],
  );
  return (
    <>
      <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
        С покупкой и без неё
      </Txt>
      <ForecastResultView result={result} baseline={baseline} />
      <Txt style={{ fontSize: 11, lineHeight: 19, color: C.muted }}>
        Те же доходы, счета, взносы и ежедневные расходы, что в разделе
        «Прогноз». Покупка уменьшает остаток с выбранной даты. Суммы на счетах и
        история операций остаются прежними.
      </Txt>
    </>
  );
}
