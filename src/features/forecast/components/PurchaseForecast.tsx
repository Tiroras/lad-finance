import { useMemo } from "react";
import {
  forecast,
  type ForecastHorizon,
  type ForecastResult,
} from "../../../domain/forecast";
import { useFinance } from "../../../state/finance";
import { C, font, Txt } from "../../../shared/ui";
import { ForecastResultView } from "./ForecastResultView";

export function PurchaseForecast({
  amount,
  date,
  horizon,
  baseline,
  accountId,
}: {
  amount: number;
  date: string;
  horizon: ForecastHorizon;
  baseline: ForecastResult;
  accountId: string;
}) {
  const { state, today } = useFinance();
  const result = useMemo(
    () =>
      forecast({ ...state, version: 8 }, horizon, today, {
        amount,
        date,
        accountId,
      }),
    [state, horizon, today, amount, date, accountId],
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
