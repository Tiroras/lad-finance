import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import type { Debt } from "../../../domain/debts";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import {
  Button,
  DeleteButton,
  ErrorText,
  Field,
  Notice,
  Segments,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";

export function DebtForm({ id, close }: { id?: string; close: () => void }) {
  const { state, today, notify } = useFinance();
  const { parseMoney } = useMoney();
  const actions = useFinanceActions();
  const original = state.debts?.find((debt) => debt.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [direction, setDirection] = useState<Debt["direction"]>(
    original?.direction ?? "borrowed",
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      state.accounts.find((account) => account.kind === "spending")!.id,
  );
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"record" | "existing">("record");
  const [date, setDate] = useState(original?.startsOn ?? today);
  const [dueDate, setDueDate] = useState(original?.dueDate ?? "");
  const [note, setNote] = useState(original?.note ?? "");
  const { error, run } = useActionError();
  const currency = accountCurrency(state, accountId);
  const hasOperations = state.transactions.some(
    (transaction) => transaction.debtId === id,
  );
  return (
    <>
      {!original && (
        <Segments
          value={direction}
          onChange={setDirection}
          options={[
            { value: "borrowed", label: "Я должен" },
            { value: "lent", label: "Мне должны" },
          ]}
        />
      )}
      <Field
        label="Кому или от кого"
        accessibilityLabel="Название долга"
        value={name}
        onChangeText={setName}
        placeholder="Например, Алексей · ремонт"
        maxLength={120}
      />
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
        currency={original?.currency}
        label="Счёт для движения денег"
      />
      {!original && (
        <>
          <Segments
            value={mode}
            onChange={setMode}
            options={[
              { value: "record", label: "Записать движение" },
              { value: "existing", label: "Уже учтено" },
            ]}
          />
          <Notice>
            {mode === "record"
              ? direction === "borrowed"
                ? "Сумма долга поступит на выбранный счёт одной операцией. Возвраты будут уменьшать этот долг."
                : "Сумма долга спишется с выбранного счёта одной операцией. Возвраты поступят обратно."
              : "Добавится только остаток уже существующего долга. Деньги на счетах не изменятся: убедитесь, что их движение уже учтено."}
          </Notice>
          <Field
            label={`${mode === "record" ? "Сумма долга" : "Остаток долга"}, ${currencySymbol(currency)}`}
            accessibilityLabel="Сумма долга"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            maxLength={16}
          />
          <Field
            label="Дата начала учёта долга · ГГГГ-ММ-ДД"
            accessibilityLabel="Дата долга"
            value={date}
            onChangeText={setDate}
            maxLength={10}
          />
        </>
      )}
      <Field
        label="Вернуть до · ГГГГ-ММ-ДД, необязательно"
        accessibilityLabel="Срок возврата долга"
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="Без срока"
        maxLength={10}
      />
      <Field
        label="Заметка"
        accessibilityLabel="Заметка о долге"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />
      <Notice>
        Основная сумма долга не считается доходом или расходом. Проценты
        записывайте отдельным расходом. Будущий возврат выданных денег не
        увеличивает сумму «можно потратить» до фактического поступления.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить долг"
        onPress={() =>
          run(() => {
            const parsed = original ? undefined : parseMoney(amount, currency);
            if (parsed === null)
              throw new Error("Введите сумму долга в валюте выбранного счёта.");
            actions.saveDebt({
              id,
              name,
              direction,
              accountId,
              amount: parsed,
              date,
              dueDate,
              note,
              recordTransaction: mode === "record",
            });
            notify("Долг сохранён");
            close();
          })
        }
      />
      {original &&
        (hasOperations ? (
          <Notice>
            У долга есть операции: они сохраняются в истории. Для исправления
            ошибочной записи откройте её в разделе операций и удалите; затем
            запишите правильное движение.
          </Notice>
        ) : (
          <DeleteButton
            label="Удалить долг"
            explanation="Удалится только запись долга. Остатки счетов не изменятся."
            onDelete={() =>
              run(() => {
                actions.deleteDebt(original.id);
                notify("Долг удалён");
                close();
              })
            }
          />
        ))}
    </>
  );
}
