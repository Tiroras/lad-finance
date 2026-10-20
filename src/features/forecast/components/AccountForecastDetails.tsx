import { View } from "react-native";
import type { ForecastResult } from "../../../domain/forecast";
import { money } from "../../../domain/currency";
import { dateLabel } from "../../../shared/lib/dates";
import { useMoney } from "../../../state/finance";
import { C, Card, Notice, Txt, font } from "../../../shared/ui";

export function AccountForecastDetails({
  result,
  date,
}: {
  result: ForecastResult;
  date: string;
}) {
  const { money: baseMoney } = useMoney();
  const index = Math.max(
    0,
    result.days.findIndex((day) => day.date === date),
  );
  const day = result.days[index];
  return (
    <View testID="account-forecast">
      <Card style={{ gap: 14 }}>
        <Txt style={{ fontFamily: font.bold }}>
          Счета к концу {dateLabel(day.date)}
        </Txt>
        {result.unallocatedEvents.length > 0 && (
          <Notice tone="warning">
            Есть неназначенные события: {result.unallocatedEvents.length}.
            Назначьте счета в настройках прогноза и разовых событиях сценария.
            Пока нельзя подтвердить достаточность отдельного счёта.
          </Notice>
        )}
        {result.warnings.map((warning) => (
          <Notice key={warning} tone="warning">
            {warning}
          </Notice>
        ))}
        {result.accounts.map((account) => {
          const entry = account.days[index];
          return (
            <View key={account.accountId} style={{ gap: 5 }}>
              <Txt style={{ fontFamily: font.semibold }}>
                {account.name} · {account.currency}
              </Txt>
              <Txt style={{ color: account.firstShortfall ? C.red : C.ink }}>
                {account.kind === "credit" ? "Баланс карты" : "Доступно"}:{" "}
                {money(entry.available, true, account.currency)}
              </Txt>
              {entry.held > 0 && (
                <Txt>
                  Удержание: {money(entry.held, true, account.currency)}
                </Txt>
              )}
              <Txt style={{ fontSize: 12, color: C.muted }}>
                Минимум за период:{" "}
                {money(account.minimum.available, true, account.currency)}
                {" · "}
                {dateLabel(account.minimum.date)}
              </Txt>
              {account.firstShortfall && (
                <Txt style={{ color: C.red }}>
                  Нехватка на счёте с {dateLabel(account.firstShortfall.date)}.
                  Назначьте своевременный перевод.
                </Txt>
              )}
            </View>
          );
        })}
        <Txt>
          Сумма доступных повседневных счетов:{" "}
          {baseMoney(day.accountAvailable, true)}. Неназначенное влияние:{" "}
          {baseMoney(day.unallocated, true)}.
        </Txt>
        {day.valuationRounding !== 0 && (
          <Txt>
            Округление валютной оценки: {baseMoney(day.valuationRounding, true)}
            .
          </Txt>
        )}
        <Notice>
          Кредитный лимит не входит в собственные деньги. Показаны остатки на
          конец дня; порядок поступлений и списаний внутри дня не проверяется.
        </Notice>
      </Card>
    </View>
  );
}
