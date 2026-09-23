import { useState } from "react";
import { StyleSheet, View } from "react-native";
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
import {
  C,
  Button,
  Field,
  Notice,
  Segments,
  ErrorText,
  AmountField,
} from "../../../shared/ui";
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
      : "",
  );
  const [limit, setLimit] = useState(
    original ? moneyInput(original.creditLimit ?? 0, currency) : "",
  );
  const [dueDate, setDueDate] = useState(original?.paymentDueDate ?? "");
  const [dueAmount, setDueAmount] = useState(
    original
      ? moneyInput(creditPaymentRemaining(state, original, today), currency)
      : "",
  );
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const balanceInput = amount.trim() || "0";
      const negative = balanceInput.startsWith("-");
      const magnitude = parseMoney(
        /^[+-]/.test(balanceInput) ? balanceInput.slice(1) : balanceInput,
        currency,
      );
      const parsed =
        magnitude === null ? null : magnitude * (negative ? -1 : 1);
      if (parsed === null)
        return setError(
          "Укажите корректный остаток в валюте счёта. Задолженность по кредитной карте — со знаком минус.",
        );
      const creditLimit =
        kind === "credit"
          ? parseMoney(limit.trim() || "0", currency)
          : undefined;
      const paymentDueAmount =
        kind === "credit"
          ? parseMoney(dueAmount.trim() || "0", currency)
          : undefined;
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
        <View style={s.accountTypes}>
          <Segments
            style={s.accountTypeRow}
            value={kind}
            onChange={setKind}
            options={[
              { value: "spending", label: "Повседневный" },
              { value: "savings", label: "Накопительный" },
            ]}
          />
          <Segments
            style={s.accountTypeRow}
            value={kind}
            onChange={setKind}
            options={[{ value: "credit", label: "Кредитная карта" }]}
          />
        </View>
      )}
      <CurrencyPicker
        value={currency}
        onChange={setCurrency}
        disabled={!!original}
      />
      <AmountField
        label={`Текущий остаток, ${currencySymbol(currency)}`}
        accessibilityLabel="Остаток на счёте"
        value={amount}
        onChangeText={setAmount}
        keyboardType={
          kind === "credit" || original
            ? "numbers-and-punctuation"
            : "decimal-pad"
        }
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

const s = StyleSheet.create({
  accountTypes: {
    gap: 3,
    padding: 4,
    backgroundColor: C.soft,
    borderRadius: 13,
  },
  accountTypeRow: {
    padding: 0,
    backgroundColor: "transparent",
  },
});
