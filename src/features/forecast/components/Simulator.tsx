import { useState } from "react";
import { CURRENCIES } from "../../../domain/currency";
import { dateLabel, shiftDate, validDate } from "../../../domain/finance";
import type { ForecastHorizon } from "../../../domain/forecast";
import { ForecastRange } from "./ForecastRange";
import { PurchaseAllowance } from "./PurchaseAllowance";
import { PurchaseForecast } from "./PurchaseForecast";
import { PurchasePlanner } from "./PurchasePlanner";
import { useMoney, useFinance } from "../../../state/finance";
import { Chip, Field, font, Notice, Row, ErrorText } from "../../../shared/ui";

export function Simulator() {
  const {
    money,
    parseMoney,
    currency: baseCode,
    symbol: baseSymbol,
  } = useMoney();
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
        label={`Сколько стоит покупка, ${baseSymbol}`}
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
            label={money(n * 10 ** CURRENCIES[baseCode].digits)}
            active={parsed === n * 10 ** CURRENCIES[baseCode].digits}
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
      {dateValid && (
        <PurchasePlanner
          amount={parsed ?? 0}
          date={date}
          horizon={horizon}
          setDate={setDate}
          setAmount={setAmount}
        />
      )}
      {parsed !== null && parsed > 0 ? (
        dateValid && (
          <>
            {date === today && <PurchaseAllowance amount={parsed} />}
            <PurchaseForecast amount={parsed} date={date} horizon={horizon} />
          </>
        )
      ) : (
        <ErrorText error="Введите стоимость покупки больше нуля, в пределах допустимого лимита." />
      )}
    </>
  );
}
