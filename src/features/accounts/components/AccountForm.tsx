import { useState } from "react";
import { currencySymbol, type CurrencyCode } from "../../../domain/currency";
import { accountBalance } from "../../../domain/finance";
import type { Account } from "../../../domain/types";
import { creditPaymentRemaining } from "../../../domain/debts";
import { CurrencyPicker } from "../../currencies";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import { Button, Field, Notice, Segments, ErrorText } from "../../../shared/ui";
import { CreditCardFields } from "./CreditCardFields";

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
  const { state, today, notify } = useFinance();
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
          accountBalance(state, original.id, today),
          original.currency ?? "RUB",
        )
      : "0",
  );
  const [limit, setLimit] = useState(
    moneyInput(original?.creditLimit ?? 0, currency),
  );
  const [dueDate, setDueDate] = useState(original?.paymentDueDate ?? "");
  const [dueAmount, setDueAmount] = useState(
    moneyInput(
      original ? creditPaymentRemaining(state, original, today) : 0,
      currency,
    ),
  );
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const negative = amount.trim().startsWith("-");
      const magnitude = parseMoney(
        /^[+-]/.test(amount.trim()) ? amount.trim().slice(1) : amount,
        currency,
      );
      const parsed =
        magnitude === null ? null : magnitude * (negative ? -1 : 1);
      if (parsed === null)
        return setError(
          "Укажите корректный остаток в валюте счёта. Задолженность по кредитной карте — со знаком минус.",
        );
      const creditLimit =
        kind === "credit" ? parseMoney(limit, currency) : undefined;
      const paymentDueAmount =
        kind === "credit" ? parseMoney(dueAmount, currency) : undefined;
      if (creditLimit === null || paymentDueAmount === null)
        return setError("Проверьте кредитный лимит и обязательный платёж.");
      actions.saveAccount({
        id,
        name,
        kind,
        balance: parsed,
        currency,
        ...(kind === "credit"
          ? { creditLimit, paymentDueAmount, paymentDueDate: dueDate }
          : {}),
      });
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
            { value: "credit", label: "Кредитная карта" },
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
        keyboardType={
          kind === "credit" || original
            ? "numbers-and-punctuation"
            : "decimal-pad"
        }
        maxLength={16}
      />
      {kind === "credit" && (
        <>
          <Notice>
            Укажите фактический остаток: долг банку со знаком минус, собственные
            деньги на карте — со знаком плюс или без знака. Например, долг 5 000
            — «-5000».
          </Notice>
          <CreditCardFields
            currency={currency}
            limit={limit}
            onLimitChange={setLimit}
            dueDate={dueDate}
            onDueDateChange={setDueDate}
            dueAmount={dueAmount}
            onDueAmountChange={setDueAmount}
          />
        </>
      )}
      <Notice>
        Корректировка остатка сохраняется на сегодняшнюю дату и не считается
        доходом или расходом.{" "}
        {kind === "savings"
          ? "Накопительный счёт не входит в сумму «можно потратить»."
          : "Доходы и расходы записывайте в операциях."}
      </Notice>
      <ErrorText error={error} />
      <Button label="Сохранить счёт" onPress={save} />
    </>
  );
}
