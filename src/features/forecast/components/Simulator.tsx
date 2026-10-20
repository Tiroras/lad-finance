import { useMemo, useState } from "react";
import {
  accountCurrency,
  accountToBase,
  CURRENCIES,
  currencySymbol,
} from "../../../domain/currency";
import { dateLabel, shiftDate, validDate } from "../../../domain/finance";
import { forecast, type ForecastHorizon } from "../../../domain/forecast";
import { ForecastRange } from "./ForecastRange";
import { PurchaseAllowance } from "./PurchaseAllowance";
import { PurchaseForecast } from "./PurchaseForecast";
import { PurchasePlanner } from "./PurchasePlanner";
import { planPurchase } from "../../../domain/purchasePlanner";
import { AccountPicker } from "../../accounts";
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
  const { money, parseMoney } = useMoney();
  const { state, today } = useFinance();
  const [amount, setAmount] = useState("12000");
  const [date, setDate] = useState(today);
  const [horizon, setHorizon] = useState<ForecastHorizon>(30);
  const [accountId, setAccountId] = useState(
    state.accounts.find(
      (account) => !account.archived && account.kind === "spending",
    )?.id ?? "",
  );
  const currency = accountId ? accountCurrency(state, accountId) : "RUB";
  const calculation = useMemo(() => {
    try {
      return {
        baseline: forecast({ ...state, version: 8 }, horizon, today),
        error: "",
      };
    } catch (error) {
      return {
        baseline: undefined,
        error:
          error instanceof Error
            ? error.message
            : "Не удалось построить прогноз.",
      };
    }
  }, [state, horizon, today]);
  const baseline = calculation.baseline;
  const parsed = parseMoney(amount, currency);
  const last = shiftDate(today, horizon - 1);
  const dateValid = validDate(date) && date >= today && date <= last;
  return (
    <>
      <Notice>
        Примерьте покупку к плану. Это сценарий: деньги не списываются, операция
        не создаётся.
      </Notice>
      <AccountPicker
        label="Счёт покупки"
        spendingOnly
        selected={accountId}
        onChange={setAccountId}
      />
      <AmountField
        label={`Сколько стоит покупка, ${currencySymbol(currency)}`}
        accessibilityLabel="Стоимость покупки"
        value={amount}
        onChangeText={setAmount}
        style={{ fontSize: 36, fontFamily: font.semibold }}
      />
      <Row style={{ flexWrap: "wrap" }}>
        {[3000, 12000, 30000, 60000].map((n) => (
          <Chip
            key={n}
            label={money(
              n * 10 ** CURRENCIES[currency].digits,
              false,
              currency,
            )}
            active={parsed === n * 10 ** CURRENCIES[currency].digits}
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
      {calculation.error && <ErrorText error={calculation.error} />}
      {dateValid && baseline && accountId && (
        <PurchasePlanner
          amount={parsed ?? 0}
          date={date}
          baseline={baseline}
          accountId={accountId}
          setDate={setDate}
          setAmount={setAmount}
        />
      )}
      {parsed !== null && parsed > 0 ? (
        dateValid &&
        baseline &&
        accountId && (
          <>
            {date === today && (
              <PurchaseAllowance
                amount={accountToBase(state, parsed, accountId)}
                accountAffordable={
                  planPurchase(baseline, parsed, date, { state, accountId })
                    .maximum >= parsed
                }
              />
            )}
            <PurchaseForecast
              amount={parsed}
              date={date}
              horizon={horizon}
              baseline={baseline}
              accountId={accountId}
            />
          </>
        )
      ) : (
        <ErrorText error="Введите стоимость покупки больше нуля, в пределах допустимого лимита." />
      )}
    </>
  );
}
