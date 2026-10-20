import { useState } from "react";
import type { ForecastTransfer } from "../../../domain/types";
import { accountCurrency, money, parseMoney } from "../../../domain/currency";
import { uid } from "../../../domain/finance";
import { dateLabel, validDate } from "../../../shared/lib/dates";
import { useFinance } from "../../../state/finance";
import {
  AmountField,
  Button,
  Card,
  DateField,
  ErrorText,
  Field,
  Notice,
  SelectField,
  Txt,
} from "../../../shared/ui";

export function ForecastTransfers({
  transfers,
  onChange,
}: {
  transfers: ForecastTransfer[];
  onChange: (value: ForecastTransfer[]) => void;
}) {
  const { state, today } = useFinance();
  const [name, setName] = useState("Перевод между счетами");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [error, setError] = useState("");
  const source = accountId ? accountCurrency(state, accountId) : "RUB";
  const target = toAccountId ? accountCurrency(state, toAccountId) : source;
  const options = state.accounts
    .filter((account) => !account.archived)
    .map((account) => ({
      value: account.id,
      label: `${account.name} · ${account.currency ?? "RUB"}`,
    }));
  return (
    <Card style={{ gap: 14 }}>
      <Txt>Плановые переводы</Txt>
      <Notice>
        Перевод изменяет только прогноз. Укажите обе суммы при обмене валют.
        После фактического перевода удалите план, чтобы не учитывать его
        повторно. Просроченный план не переносится автоматически.
      </Notice>
      {transfers.length >= 160 && (
        <Notice tone="warning">
          Использовано {transfers.length} из 200 плановых переводов. Удалите
          выполненные планы перед добавлением новых.
        </Notice>
      )}
      {transfers.map((transfer) => (
        <Card key={transfer.id} style={{ gap: 10 }}>
          <Txt>
            {transfer.name} ·{" "}
            {dateLabel(transfer.date, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Txt>
          <Txt>
            Списание:{" "}
            {money(
              transfer.amount,
              true,
              accountCurrency(state, transfer.accountId),
            )}
          </Txt>
          <Txt>
            Зачисление:{" "}
            {money(
              transfer.toAmount ?? transfer.amount,
              true,
              accountCurrency(state, transfer.toAccountId),
            )}
          </Txt>
          <Txt>
            {
              state.accounts.find((entry) => entry.id === transfer.accountId)
                ?.name
            }
            {" → "}
            {
              state.accounts.find((entry) => entry.id === transfer.toAccountId)
                ?.name
            }
          </Txt>
          <Button
            label={`Удалить плановый перевод: ${transfer.name}`}
            variant="secondary"
            onPress={() =>
              onChange(transfers.filter((entry) => entry.id !== transfer.id))
            }
          />
        </Card>
      ))}
      <Field
        label="Название планового перевода"
        accessibilityLabel="Название планового перевода"
        value={name}
        onChangeText={setName}
      />
      <SelectField
        label="Откуда плановый перевод"
        value={accountId}
        options={options.filter(
          (option) =>
            state.accounts.find((account) => account.id === option.value)
              ?.kind !== "credit",
        )}
        onChange={setAccountId}
      />
      <SelectField
        label="Куда плановый перевод"
        value={toAccountId}
        options={options.filter((option) => option.value !== accountId)}
        onChange={setToAccountId}
      />
      <AmountField
        label={`Списание в плане, ${source}`}
        accessibilityLabel={`Списание в плане, ${source}`}
        value={amount}
        onChangeText={setAmount}
      />
      {source !== target && (
        <AmountField
          label={`Зачисление в плане, ${target}`}
          accessibilityLabel={`Зачисление в плане, ${target}`}
          value={toAmount}
          onChangeText={setToAmount}
        />
      )}
      <DateField
        label="Дата планового перевода"
        accessibilityLabel="Дата планового перевода"
        value={date}
        onChangeText={setDate}
      />
      <ErrorText error={error} />
      <Button
        label="Добавить плановый перевод"
        variant="secondary"
        onPress={() => {
          const debit = parseMoney(amount, source);
          const credit =
            source === target ? debit : parseMoney(toAmount, target);
          if (
            !name.trim() ||
            !accountId ||
            !toAccountId ||
            accountId === toAccountId ||
            !debit ||
            !credit ||
            !validDate(date) ||
            date < today
          ) {
            setError(
              "Укажите название, разные счета, положительные суммы и дату не раньше сегодня.",
            );
            return;
          }
          onChange([
            ...transfers,
            {
              id: uid(),
              name: name.trim(),
              date,
              accountId,
              toAccountId,
              amount: debit,
              ...(source !== target ? { toAmount: credit } : {}),
            },
          ]);
          setAmount("");
          setToAmount("");
          setError("");
        }}
      />
    </Card>
  );
}
