import { useState } from "react";
import { currencySymbol, type CurrencyCode } from "../domain/currency";
import { accountBalance } from "../domain/finance";
import type { Account } from "../domain/types";
import { CurrencyPicker } from "../features/currencies/CurrencyPicker";
import { useActionError } from "../hooks/useActionError";
import { useFinanceActions } from "../hooks/useFinanceActions";
import { useMoney } from "../hooks/useMoney";
import { useFinance } from "../store";
import { Button, Field, Notice, Segments } from "../ui";
import { ErrorText } from "./ErrorText";

export function AccountForm({
  id,
  close,
  defaultCurrency,
  defaultKind,
}: {
  id?: string;
  close: () => void;
  defaultCurrency?: CurrencyCode;
  defaultKind?: Account["kind"];
}) {
  const { moneyInput, parseMoney, currency: baseCode } = useMoney();
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.accounts.find((a) => a.id === id);
  const [currency, setCurrency] = useState<CurrencyCode>(
    original ? (original.currency ?? "RUB") : (defaultCurrency ?? baseCode),
  );
  const [name, setName] = useState(original?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(
    original?.kind ?? defaultKind ?? "spending",
  );
  const [amount, setAmount] = useState(
    original
      ? moneyInput(
          accountBalance(state, original.id),
          original.currency ?? "RUB",
        )
      : "0",
  );
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, currency);
      if (parsed === null)
        return setError(
          "Укажите корректный неотрицательный остаток в валюте счёта.",
        );
      actions.saveAccount({ id, name, kind, balance: parsed, currency });
      notify("Счёт сохранён");
      close();
    });
  return (
    <>
      <Field
        label="Название счёта"
        accessibilityLabel="Название счёта"
        placeholder="Например, карта для покупок"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      {!original && (
        <Segments
          value={kind}
          onChange={setKind}
          options={[
            { value: "spending", label: "Повседневный" },
            { value: "savings", label: "Накопительный" },
          ]}
        />
      )}
      <CurrencyPicker
        value={currency}
        onChange={setCurrency}
        disabled={!!original}
      />
      <Field
        label={`Текущий остаток, ${currencySymbol(currency)}`}
        accessibilityLabel="Остаток на счёте"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Корректировка остатка не считается доходом или расходом.{" "}
        {kind === "savings"
          ? "Накопительный счёт не входит в сумму «можно потратить»."
          : "Доходы и расходы записывайте в операциях."}
      </Notice>
      <ErrorText error={error} />
      <Button label="Сохранить счёт" onPress={save} />
    </>
  );
}
