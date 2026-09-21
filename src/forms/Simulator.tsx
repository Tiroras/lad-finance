import { useState } from "react";
import {
  dateLabel,
  money,
  parseMoney,
  shiftDate,
  validDate,
} from "../domain/finance";
import type { ForecastHorizon } from "../domain/forecast";
import { ForecastRange } from "../features/forecast/ForecastRange";
import { PurchaseAllowance } from "../features/forecast/PurchaseAllowance";
import { PurchaseForecast } from "../features/forecast/PurchaseForecast";
import { useFinance } from "../store";
import { Chip, Field, font, Notice, Row } from "../ui";
import { ErrorText } from "./ErrorText";

export function Simulator() {
  const { today } = useFinance();
  const [amount, setAmount] = useState("12000");
  const [date, setDate] = useState(today);
  const [horizon, setHorizon] = useState<ForecastHorizon>(30);
  const parsed = parseMoney(amount);
  const last = shiftDate(today, horizon - 1);
  const dateValid = validDate(date) && date >= today && date <= last;
  return (
    <>
      <Notice>
        Примерьте покупку к плану. Это сценарий: деньги не списываются, операция
        не создаётся.
      </Notice>
      <Field
        label="Сколько стоит покупка, ₽"
        accessibilityLabel="Стоимость покупки"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        style={{ fontSize: 36, fontFamily: font.semibold }}
        maxLength={16}
      />
      <Row style={{ flexWrap: "wrap" }}>
        {[3000, 12000, 30000, 60000].map((n) => (
          <Chip
            key={n}
            label={money(n * 100)}
            active={parsed === n * 100}
            onPress={() => setAmount(String(n))}
          />
        ))}
      </Row>
      <Field
        label="Дата покупки · ГГГГ-ММ-ДД"
        accessibilityLabel="Дата покупки"
        value={date}
        onChangeText={setDate}
        maxLength={10}
        error={
          dateValid
            ? undefined
            : `Укажите дату с ${dateLabel(today)} по ${dateLabel(last)} или увеличьте период.`
        }
      />
      <ForecastRange value={horizon} onChange={setHorizon} />
      {parsed !== null && parsed > 0 ? (
        dateValid && (
          <>
            {date === today && <PurchaseAllowance amount={parsed} />}
            <PurchaseForecast amount={parsed} date={date} horizon={horizon} />
          </>
        )
      ) : (
        <ErrorText error="Введите стоимость покупки больше нуля, не более 1 млрд ₽." />
      )}
    </>
  );
}
