import { useMemo } from "react";
import { View } from "react-native";
import { dateLabel, spendable } from "../../../domain/finance";
import { useMoney, useFinance } from "../../../state/finance";
import { C, Card, font, Notice, Row, Txt } from "../../../shared/ui";

export function FormulaContent() {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const safe = useMemo(() => spendable(state, today), [state, today]);
  return (
    <>
      <Notice>
        Считаем только деньги, которые уже есть. Будущий доход и накопительные
        счета в доступную сумму не входят.
      </Notice>
      <Txt style={{ fontSize: 12, lineHeight: 21, color: C.muted }}>
        {safe.income
          ? `${state.settings.spendableIncomeId ? "Выбранный доход" : "Ближайший доход"}: «${safe.income.plan.name}», ${dateLabel(safe.payday)}. ${safe.payday === today ? "Он ещё не получен: считаем один день и сохраняем деньги на сегодняшние платежи." : "Расчёт включает сегодня и дни до поступления."}`
          : `Опорная дата — ${dateLabel(safe.payday)}, день дохода из настроек. ${safe.selectedIncomeUnavailable ? "У выбранного дохода нет неполученных поступлений в ближайшие 90 дней." : "В ближайшие 90 дней нет неполученных планируемых доходов."} Добавьте план с суммой и датой для проверки дальнейших обязательств.`}
      </Txt>
      <Card style={{ gap: 22 }}>
        {[
          { label: "На повседневных счетах", value: safe.liquid, sign: "" },
          {
            label: "Платежи до дохода и просрочки",
            value: safe.payments,
            sign: "−",
          },
          {
            label: "Возвраты долгов и платежи по кредитным картам",
            value: safe.debts,
            sign: "−",
          },
          {
            label: "Осталось отложить на цели в этом месяце",
            value: safe.goals,
            sign: "−",
          },
          { label: "Неприкосновенный остаток", value: safe.buffer, sign: "−" },
          ...(safe.protectedAmount > 0
            ? [
                {
                  label: "Дополнительно оставляем на дальнейший план",
                  value: safe.protectedAmount,
                  sign: "−",
                },
              ]
            : []),
        ].map((row) => (
          <Row
            key={row.label}
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <Txt
              style={{ flex: 1, fontSize: 12, lineHeight: 19, color: C.muted }}
            >
              {row.label}
            </Txt>
            <Txt style={{ fontFamily: font.semibold, fontSize: 13 }}>
              {row.sign}
              {money(row.value)}
            </Txt>
          </Row>
        ))}
        <View style={{ height: 1, backgroundColor: C.border }} />
        <Row style={{ justifyContent: "space-between" }}>
          <Txt style={{ fontFamily: font.bold }}>Можно потратить</Txt>
          <Txt style={{ fontSize: 23, fontFamily: font.bold }}>
            {money(safe.available)}
          </Txt>
        </Row>
      </Card>
      {safe.raw < 0 && (
        <Notice tone="warning">
          Для сохранения всего плана не хватает {money(-safe.raw)}. Проверьте
          будущие платежи и взносы на цели.
        </Notice>
      )}
      {safe.protection && (
        <Notice tone={safe.protectedAmount > 0 ? "warning" : "normal"}>
          Дополнительно проверены {safe.protection.horizon} дней до{" "}
          {dateLabel(safe.protection.end)}.{" "}
          {safe.protectedAmount > 0
            ? `Сумму ограничивает остаток на ${dateLabel(safe.protection.date)} после запланированных доходов, платежей и целей. Эти обязательства повторно не вычитаются.`
            : "Дальнейшие платежи и цели не требуют уменьшать доступную сумму."}{" "}
          {safe.protection.dailySpending > 0
            ? `С ${dateLabel(safe.protection.dailyStart)} сохраняем ${money(safe.protection.dailySpending)} в день на обычные расходы из настроек прогноза.`
            : "Обычные расходы после дохода пока не заданы в настройках прогноза."}
        </Notice>
      )}
      <Txt style={{ fontSize: 12, lineHeight: 21, color: C.muted }}>
        {money(safe.available)} ÷ {safe.days} дн. до {dateLabel(safe.payday)} ={" "}
        {money(safe.daily)} в день. В расчёте дня используется округление вниз
        до минимальной единицы основной валюты.
      </Txt>
      <Txt style={{ fontSize: 12, lineHeight: 21, color: C.muted }}>
        Это ориентир по внесённым данным. Он не учитывает расходы, которые вы
        ещё не записали или не запланировали. После фактической оплаты отметьте
        платёж — тогда сумма не будет зарезервирована повторно.
      </Txt>
    </>
  );
}
