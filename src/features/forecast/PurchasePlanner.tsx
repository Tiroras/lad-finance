import { useMemo } from "react";
import { dateLabel } from "../../domain/finance";
import { forecast, type ForecastHorizon } from "../../domain/forecast";
import { planPurchase } from "../../domain/purchasePlanner";
import { useMoney } from "../../hooks/useMoney";
import { useFinance } from "../../store";
import { Button, Card, Notice, Txt, font } from "../../ui";

export function PurchasePlanner({
  amount,
  date,
  horizon,
  setDate,
  setAmount,
}: {
  amount: number;
  date: string;
  horizon: ForecastHorizon;
  setDate: (date: string) => void;
  setAmount: (value: string) => void;
}) {
  const { money, moneyInput } = useMoney();
  const { state, today } = useFinance();
  const baseline = useMemo(
    () => forecast(state, horizon, today),
    [state, today, horizon],
  );
  const plan = planPurchase(baseline, amount, date);
  return (
    <Card style={{ gap: 14 }}>
      <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
        Когда покупка впишется в план
      </Txt>
      {plan.existingShortfall ? (
        <Notice>
          Даже без покупки остаток опустится ниже резерва{" "}
          {dateLabel(plan.existingShortfall.date)}. Сначала скорректируйте этот
          участок плана.
        </Notice>
      ) : (
        <>
          <Txt testID="purchase-maximum">
            На {dateLabel(date)} можно запланировать до{" "}
            {money(plan.maximum, true)}.
          </Txt>
          <Txt>
            Сумму ограничивает остаток {dateLabel(plan.limitingDay.date)}:{" "}
            {money(plan.limitingDay.balance, true)} при резерве{" "}
            {money(baseline.buffer)}.
          </Txt>
          {plan.maximum > 0 && (
            <Button
              label="Подставить доступную сумму"
              variant="secondary"
              onPress={() => setAmount(moneyInput(plan.maximum))}
            />
          )}
          {amount > 0 &&
            (plan.earliest ? (
              <>
                <Txt testID="purchase-earliest">
                  Ближайшая дата для этой покупки: {dateLabel(plan.earliest)}.
                </Txt>
                {plan.earliest !== date && (
                  <Button
                    label="Выбрать ближайшую дату"
                    onPress={() => setDate(plan.earliest!)}
                  />
                )}
              </>
            ) : (
              <Txt testID="purchase-earliest">
                В этом периоде покупка не помещается в план. Уменьшите стоимость
                или расширьте прогноз.
              </Txt>
            ))}
        </>
      )}
      <Notice>
        Расчёт сохраняет резерв на конец каждого дня до{" "}
        {dateLabel(plan.through)}. Учитываются запланированные доходы, платежи,
        цели и повседневные расходы. События за пределами периода и порядок
        поступлений внутри дня не проверяются.
      </Notice>
    </Card>
  );
}
