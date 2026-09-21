import { useState } from "react";
import {
  baseCurrency,
  convertMoney,
  money,
  type CurrencyCode,
} from "../../domain/currency";
import { ErrorText } from "../../forms/ErrorText";
import { useActionError } from "../../hooks/useActionError";
import { useFinanceActions } from "../../hooks/useFinanceActions";
import { useFinance } from "../../store";
import {
  Button,
  C,
  Card,
  font,
  Notice,
  Section,
  Segments,
  Txt,
} from "../../ui";
import { CurrencyPicker } from "./CurrencyPicker";
import { CurrencyRateForm } from "./CurrencyRateForm";
import { useExchangeRates } from "./ExchangeRateProvider";

export function CurrencySettings() {
  const { state, notify } = useFinance();
  const actions = useFinanceActions(),
    network = useExchangeRates();
  const { error, run } = useActionError();
  const base = baseCurrency(state);
  const [selected, setSelected] = useState(base),
    [quote, setQuote] = useState<CurrencyCode>("USD");
  let preview = "Сначала загрузите или укажите курс выбранной валюты.";
  try {
    preview = `Резерв: ${money(state.settings.buffer, true, base)} → ${money(convertMoney(state, state.settings.buffer, base, selected), true, selected)}.`;
  } catch {}
  return (
    <>
      <Notice>
        Счета и цели хранят суммы в своей валюте. Общие итоги, бюджеты и прогноз
        показываются в основной валюте.
      </Notice>
      <CurrencyPicker
        label="Основная валюта"
        value={selected}
        onChange={setSelected}
      />
      {selected !== base && (
        <Card style={{ gap: 12 }}>
          <Txt style={{ fontFamily: font.bold }}>Пересчитать в {selected}</Txt>
          <Txt style={{ fontSize: 12, lineHeight: 20 }}>
            {preview} Бюджеты, резерв, оценки прошлых операций и суммы сценариев
            будут пересчитаны по сохранённым курсам с округлением. Для операций
            в выбранной валюте берётся исходная сумма. Остатки счетов и суммы
            целей сохранят свою валюту.
          </Txt>
          <Button
            label={`Пересчитать и выбрать ${selected}`}
            onPress={() =>
              run(() => {
                actions.changeBaseCurrency(selected);
                notify("Основная валюта изменена");
              })
            }
          />
        </Card>
      )}
      <ErrorText error={error} />
      <Section title="Обновление курсов" />
      <Segments
        value={(state.settings.exchange?.automatic ?? true) ? "auto" : "manual"}
        onChange={(value) => actions.setAutomaticRates(value === "auto")}
        options={[
          { value: "auto", label: "Автоматически" },
          { value: "manual", label: "По запросу" },
        ]}
      />
      <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 20 }}>
        Frankfurter · справочные курсы центральных банков. Обновление при
        открытии приложения раз в день. Ручные значения сохраняются при
        обновлении. Последняя загрузка:{" "}
        {state.settings.exchange?.fetchedOn ?? "ещё не было"}.
      </Txt>
      <Button
        label={network.busy ? "Загружаем курсы…" : "Обновить курсы сейчас"}
        disabled={network.busy}
        variant="secondary"
        onPress={() => void network.refresh()}
      />
      <ErrorText error={network.error} />
      <CurrencyPicker label="Курс к рублю" value={quote} onChange={setQuote} />
      <CurrencyRateForm key={quote} currency={quote} />
      <Notice>
        Без сети используются сохранённые курсы с указанной датой. Это
        справочная оценка: при обмене укажите фактически полученную сумму.
        Доходы и расходы сохраняют оценку на момент записи.
      </Notice>
    </>
  );
}
