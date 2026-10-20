import { dateLabel } from "../../../domain/finance";
import type { ForecastResult } from "../../../domain/forecast";
import { planPurchase } from "../../../domain/purchasePlanner";
import { useFinance, useMoney } from "../../../state/finance";
import { accountCurrency } from "../../../domain/currency";
import { Button, Card, Notice, Txt, font } from "../../../shared/ui";

export function PurchasePlanner({
  amount,
  date,
  baseline,
  setDate,
  setAmount,
  accountId,
}: {
  amount: number;
  date: string;
  baseline: ForecastResult;
  setDate: (date: string) => void;
  setAmount: (value: string) => void;
  accountId: string;
}) {
  const { money, moneyInput } = useMoney();
  const { state } = useFinance();
  const currency = accountCurrency(state, accountId);
  const plan = planPurchase(baseline, amount, date, { state, accountId });
  return (
    <Card style={{ gap: 14 }}>
      <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>
        Когда покупка впишется в план
      </Txt>
      {plan.unallocated || plan.warnings.length > 0 ? (
        <Notice tone="warning">
          Покупку пока нельзя подтвердить. Назначьте счета для всех событий и
          устраните предупреждения прогноза.
        </Notice>
      ) : plan.accountShortfall ? (
        <Notice tone="warning">
          На выбранном счёте уже ожидается нехватка{" "}
          {dateLabel(plan.accountShortfall.date)}. Добавьте своевременный
          перевод или скорректируйте его расходы.
        </Notice>
      ) : plan.existingShortfall ? (
        <Notice>
          Даже без покупки остаток опустится ниже резерва{" "}
          {dateLabel(plan.existingShortfall.date)}. Сначала скорректируйте этот
          участок плана.
        </Notice>
      ) : (
        <>
          <Txt testID="purchase-maximum">
            На {dateLabel(date)} можно запланировать до{" "}
            {money(plan.maximum, true, currency)}.
          </Txt>
          {plan.accountMinimum && (
            <Txt>
              Минимум выбранного счёта в исходном плане с этой даты:{" "}
              {money(plan.accountMinimum.available, true, currency)} ·{" "}
              {dateLabel(plan.accountMinimum.date)}.
            </Txt>
          )}
          <Txt>
            В исходном плане с выбранной даты общий минимум:{" "}
            {money(plan.limitingDay.available, true)} ·{" "}
            {dateLabel(plan.limitingDay.date)}. Общий резерв:{" "}
            {money(baseline.buffer)}.
          </Txt>
          {plan.maximum > 0 && (
            <Button
              label="Подставить доступную сумму"
              variant="secondary"
              onPress={() => setAmount(moneyInput(plan.maximum, currency))}
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
