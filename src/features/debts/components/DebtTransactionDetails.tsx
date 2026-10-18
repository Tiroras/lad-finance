import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import type { Transaction } from "../../../domain/types";
import { dateLabel } from "../../../shared/lib/dates";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import {
  C,
  AmountField,
  Button,
  DateField,
  DeleteButton,
  ErrorText,
  font,
  Notice,
  Txt,
  Field,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";

export function DebtTransactionDetails({
  transaction,
  close,
}: {
  transaction: Transaction;
  close: () => void;
}) {
  const { state, notify } = useFinance();
  const { money, moneyInput, parseMoney } = useMoney();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const debt = state.debts?.find((entry) => entry.id === transaction.debtId);
  const currency = accountCurrency(state, transaction.accountId);
  const [expectedOriginal] = useState(transaction);
  const [title, setTitle] = useState(transaction.title);
  const [note, setNote] = useState(transaction.note ?? "");
  const [amount, setAmount] = useState(
    moneyInput(transaction.amount, currency),
  );
  const [date, setDate] = useState(transaction.date);
  const [accountId, setAccountId] = useState(transaction.accountId);
  return (
    <>
      <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>
        {transaction.title}
      </Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 24 }}>
        {money(
          transaction.amount,
          false,
          accountCurrency(state, transaction.accountId),
        )}
      </Txt>
      <Txt style={{ color: C.muted, fontSize: 13 }}>
        {dateLabel(transaction.date)} ·{" "}
        {
          state.accounts.find((account) => account.id === transaction.accountId)
            ?.name
        }
      </Txt>
      <Notice>
        {transaction.debtAction === "issue" ? "Выдача" : "Возврат"} основной
        суммы долга «{debt?.name}». Эта операция меняет остаток счёта и долга
        одновременно. Исправление сохраняет связь с долгом и проверяет все
        последующие возвраты. Основная сумма не входит в обычные доходы и
        расходы.
      </Notice>
      <Field
        label="Описание движения"
        accessibilityLabel="Описание движения долга"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      <AmountField
        label={`Сумма, ${currencySymbol(currency)}`}
        accessibilityLabel="Сумма движения долга"
        value={amount}
        onChangeText={setAmount}
      />
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
        currency={currency}
        label="Счёт движения долга"
      />
      <DateField
        label="Дата движения"
        accessibilityLabel="Дата движения долга"
        value={date}
        onChangeText={setDate}
      />
      <Field
        label="Примечание"
        accessibilityLabel="Примечание к движению долга"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      <Notice>
        Если уменьшенная выдача или новая дата оставят возврат без достаточного
        долга, изменение будет отклонено целиком. Сначала проверьте сумму и дату
        связанных возвратов.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Сохранить движение долга"
        onPress={() =>
          run(() => {
            const parsed = parseMoney(amount, currency);
            if (parsed === null)
              throw new Error("Проверьте сумму движения в валюте долга.");
            actions.editDebtTransaction({
              id: transaction.id,
              title,
              note,
              amount: parsed,
              date,
              accountId,
              expectedOriginal,
            });
            notify("Движение долга исправлено");
            close();
          })
        }
      />
      <DeleteButton
        label="Удалить операцию долга"
        explanation="Движение денег будет отменено на счёте и в остатке долга. Если после удаления возвраты превысят сумму долга, приложение попросит сначала исправить их."
        onDelete={() =>
          run(() => {
            actions.deleteTransaction(transaction.id);
            notify("Операция долга удалена");
            close();
          })
        }
      />
    </>
  );
}
