import { useState } from "react";
import {
  CURRENCIES,
  parseRate,
  rateInput,
  type CurrencyCode,
} from "../../../domain/currency";
import {
  ErrorText,
  Button,
  C,
  Card,
  Field,
  font,
  Txt,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import { useFinanceActions, useFinance } from "../../../state/finance";

export function CurrencyRateForm({ currency }: { currency: CurrencyCode }) {
  const { state, notify } = useFinance();
  const rate = state.settings.exchange?.rates[currency];
  const [draft, setDraft] = useState<string | null>(null);
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  if (currency === "RUB") return <Txt>Курс рубля к рублю всегда равен 1.</Txt>;
  return (
    <Card style={{ gap: 14 }}>
      <Txt style={{ fontFamily: font.bold }}>{CURRENCIES[currency].name}</Txt>
      <Field
        label={`1 ${currency} в рублях`}
        accessibilityLabel={`Курс ${currency}`}
        keyboardType="decimal-pad"
        maxLength={16}
        value={draft ?? (rate ? rateInput(rate.value) : "")}
        onChangeText={setDraft}
        placeholder="Введите курс"
      />
      <Txt style={{ color: C.muted, fontSize: 12 }}>
        {rate
          ? `${rate.source === "manual" ? "Вручную" : "Frankfurter"} · ${rate.date}`
          : "Курс ещё не загружен"}
      </Txt>
      <Button
        label="Сохранить свой курс"
        onPress={() =>
          run(() => {
            const value = parseRate(
              draft ?? (rate ? rateInput(rate.value) : ""),
            );
            if (value === null)
              throw new Error(
                "Введите положительный курс, до 8 знаков после запятой.",
              );
            actions.saveCurrencyRate(currency, value);
            setDraft(null);
            notify("Ручной курс сохранён");
          })
        }
      />
      {rate?.source === "manual" && (
        <Button
          variant="secondary"
          label="Вернуть автоматический курс"
          onPress={() =>
            run(() => {
              actions.restoreAutomaticRate(currency);
              setDraft(null);
              notify("Автоматический курс восстановлен");
            })
          }
        />
      )}
      <ErrorText error={error} />
    </Card>
  );
}
