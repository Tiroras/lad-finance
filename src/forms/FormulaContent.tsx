import { View } from "react-native";
import { dateLabel, spendable } from "../domain/finance";
import { useMoney } from "../hooks/useMoney";
import { useFinance } from "../store";
import { C, Card, font, Notice, Row, Txt } from "../ui";

export function FormulaContent() {
  const { money } = useMoney();
  const { state, today } = useFinance();
  const safe = spendable(state, today);
  return (
    <>
      <Notice>
        Считаем только деньги, которые уже есть. Будущий доход и накопительные
        счета в доступную сумму не входят.
      </Notice>
      <Card style={{ gap: 22 }}>
        {[
          { label: "На повседневных счетах", value: safe.liquid, sign: "" },
          {
            label: "Платежи до дохода и просрочки",
            value: safe.payments,
            sign: "−",
          },
          {
            label: "Осталось отложить на цели в этом месяце",
            value: safe.goals,
            sign: "−",
          },
          { label: "Неприкосновенный остаток", value: safe.buffer, sign: "−" },
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
