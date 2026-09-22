import { useMemo, useState } from "react";
import { CURRENCIES } from "../../../domain/currency";
import { dateLabel, shiftDate, validDate } from "../../../domain/finance";
import { forecast, type ForecastHorizon } from "../../../domain/forecast";
import { ForecastRange } from "./ForecastRange";
import { PurchaseAllowance } from "./PurchaseAllowance";
import { PurchaseForecast } from "./PurchaseForecast";
import { PurchasePlanner } from "./PurchasePlanner";
import { useMoney, useFinance } from "../../../state/finance";
import {
  Chip,
  font,
  Notice,
  Row,
  ErrorText,
  AmountField,
  DateField,
} from "../../../shared/ui";

export function Simulator() {
  const {
    money,
    parseMoney,
    currency: baseCode,
    symbol: baseSymbol,
  } = useMoney();
  const { state, today } = useFinance();
  const [amount, setAmount] = useState("12000");
  const [date, setDate] = useState(today);
  const [horizon, setHorizon] = useState<ForecastHorizon>(30);
  const baseline = useMemo(
    () => forecast(state, horizon, today),
    [state, horizon, today],
  );
  const parsed = parseMoney(amount);
  const last = shiftDate(today, horizon - 1);
  const dateValid = validDate(date) && date >= today && date <= last;
  return (
    <>
      <Notice>
        Примерьте покупку к плану. Это сценарий: деньги не списываются, операция
        не создаётся.
      </Notice>
      <AmountField
        label={`Сколько стоит покупка, ${baseSymbol}`}
        accessibilityLabel="Стоимость покупки"
        value={amount}
        onChangeText={setAmount}
        style={{ fontSize: 36, fontFamily: font.semibold }}
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
      <DateField
        label="Дата покупки"
        accessibilityLabel="Дата покупки"
        value={date}
        onChangeText={setDate}
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
          baseline={baseline}
          setDate={setDate}
          setAmount={setAmount}
        />
      )}
      {parsed !== null && parsed > 0 ? (
        dateValid && (
          <>
            {date === today && <PurchaseAllowance amount={parsed} />}
            <PurchaseForecast
              amount={parsed}
              date={date}
              horizon={horizon}
              baseline={baseline}
            />
          </>
        )
      ) : (
        <ErrorText error="Введите стоимость покупки больше нуля, в пределах допустимого лимита." />
      )}
    </>
  );
}
