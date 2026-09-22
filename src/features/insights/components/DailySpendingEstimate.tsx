import { View } from "react-native";
import { dailySpendingEstimate } from "../../../domain/insights";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, C, Card, Notice, Section, Txt } from "../../../shared/ui";

export function DailySpendingEstimate({
  onApply,
}: {
  onApply: (amount: number) => void;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const estimate = dailySpendingEstimate(state, today);
  return (
    <Card>
      <Section title="Оценка по истории" />
      <View style={{ gap: 12 }}>
        {estimate.daily === null ? (
          <Notice>
            Для оценки нужны хотя бы 14 дней истории и 5 повседневных расходов
            за 3 разных дня. За последние завершённые дни доступны:{" "}
            {estimate.days} дней, {estimate.count} операций. Сегодняшний день не
            учитывается.
          </Notice>
        ) : (
          <>
            <Notice>
              Около {money(estimate.daily)} в день по записанным расходам с{" "}
              {dateLabel(estimate.start)} по {dateLabel(estimate.end)}. Общая
              сумма {money(estimate.total)} разделена на {estimate.days}{" "}
              календарных дней, включая дни без покупок.
            </Notice>
            <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 19 }}>
              Переводы, траты с накопительных счетов и регулярные платежи
              исключены. Платежи определяются по связи с планом или совпадению
              названия, счёта и близкой суммы. Исключено платежей:{" "}
              {estimate.excludedPayments}.
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 19 }}>
              Проверьте полноту истории и разовые крупные покупки. Оценка
              заполнит поле расходов; параметры изменятся после сохранения
              прогноза.
            </Txt>
            <Button
              variant="secondary"
              label="Подставить оценку расходов"
              onPress={() => onApply(estimate.daily!)}
            />
          </>
        )}
      </View>
    </Card>
  );
}
