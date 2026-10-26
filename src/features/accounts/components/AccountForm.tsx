import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { currencySymbol, type CurrencyCode } from "../../../domain/currency";
import { accountBalance } from "../../../domain/finance";
import type { Account } from "../../../domain/types";
import { creditPaymentRemaining } from "../../../domain/debts";
import { accountArchiveBlockers } from "../../../domain/accountArchive";
import type { OpenSheet } from "../../../application/navigation/types";
import { CurrencyPicker } from "../../currencies";
import { useActionError } from "../../../shared/lib/useActionError";
import { dateLabel } from "../../../shared/lib/dates";
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
import { AccountHistory } from "./AccountHistory";

export function AccountForm({
  id,
  close,
  defaultCurrency,
  defaultKind,
  open,
  onArchiveChange,
}: {
  id?: string;
  close: () => void;
  defaultCurrency?: CurrencyCode;
  defaultKind?: Account["kind"];
  open: OpenSheet;
  onArchiveChange?: () => void;
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
  const [reminderDate, setReminderDate] = useState(
    original?.creditTermsReminderDate ?? "",
  );
  const { error, setError, run } = useActionError();
  const archiveBlockers =
    original && !original.archived
      ? accountArchiveBlockers(state, original.id, today)
      : [];
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
        kind === "credit" && !original
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
          ? {
              creditLimit,
              ...(!original
                ? {
                    paymentDueAmount,
                    paymentDueDate: dueDate,
                    creditTermsReminderDate: reminderDate,
                  }
                : {}),
            }
          : {}),
      });
      notify("Счёт сохранён");
      close();
    });
  if (original?.archived)
    return (
      <>
        <Notice>
          Счёт «{original.name}» в архиве. История сохранена; новые записи
          станут доступны после восстановления.
        </Notice>
        <ErrorText error={error} />
        <Button
          label="Восстановить счёт"
          onPress={() =>
            run(() => {
              actions.restoreAccount(original.id);
              notify("Счёт восстановлен");
              if (onArchiveChange) onArchiveChange();
              else open({ type: "accounts" });
            })
          }
        />
        <AccountHistory id={original.id} open={open} />
      </>
    );
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
            reminderDate={reminderDate}
            onReminderDateChange={setReminderDate}
            existing={!!original}
          />
          {original && (
            <>
              <Notice>
                {original.creditTermsConfirmedOn
                  ? `Выписка подтверждена ${dateLabel(original.creditTermsConfirmedOn, { day: "numeric", month: "long", year: "numeric" })}`
                  : "Дата прежней выписки неизвестна. Сверьте сумму и срок с банком."}{" "}
                Кнопка «Сохранить счёт» сохраняет название, остаток и лимит.
                Условия выписки подтвердите отдельно, даже если сумма не
                изменилась.
              </Notice>
              <Button
                label="Подтвердить условия выписки"
                onPress={() =>
                  run(() => {
                    const parsed = parseMoney(
                      dueAmount.trim() || "0",
                      currency,
                    );
                    if (parsed === null)
                      throw new Error(
                        "Проверьте оставшийся платёж в валюте карты.",
                      );
                    actions.confirmCreditTerms({
                      accountId: original.id,
                      paymentDueAmount: parsed,
                      paymentDueDate: dueDate,
                      reminderDate,
                    });
                    notify(
                      "Условия выписки подтверждены; прежние погашения учтены",
                    );
                  })
                }
              />
              <Button
                label="Сохранить напоминание о выписке"
                variant="secondary"
                onPress={() =>
                  run(() => {
                    actions.saveCreditTermsReminder(original.id, reminderDate);
                    notify(
                      reminderDate
                        ? "Дата напоминания сохранена"
                        : "Напоминание о выписке снято",
                    );
                  })
                }
              />
            </>
          )}
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
      {original && (
        <>
          <Notice>
            Архивирование сохраняет историю и исключает счёт из нового выбора.
            Нужны нулевой остаток и отсутствие ожидаемых движений и действующих
            обязательств.
          </Notice>
          {archiveBlockers.map((blocker, index) => (
            <Notice
              key={`${blocker.code}-${blocker.entityId ?? index}`}
              tone="warning"
            >
              {blocker.message}
            </Notice>
          ))}
          <Button
            label="Архивировать счёт"
            variant="secondary"
            disabled={archiveBlockers.length > 0}
            onPress={() =>
              run(() => {
                actions.archiveAccount(original.id);
                notify("Счёт перемещён в архив; история сохранена");
                if (onArchiveChange) onArchiveChange();
                else open({ type: "accounts" });
              })
            }
          />
          <AccountHistory id={original.id} open={open} />
        </>
      )}
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
