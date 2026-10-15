import type { OpenSheet } from "../../../application/navigation/types";
import { useState } from "react";
import { currencySymbol } from "../../../domain/currency";
import { debtBalance } from "../../../domain/debts";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import {
  Button,
  ErrorText,
  Notice,
  AmountField,
  DateField,
} from "../../../shared/ui";
import { AccountChoiceEmpty, AccountPicker } from "../../accounts";

function DebtRepaymentFormFields({
  id,
  close,
}: {
  id: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, today, notify } = useFinance();
  const { money, moneyInput, parseMoney } = useMoney();
  const actions = useFinanceActions();
  const debt = state.debts?.find((entry) => entry.id === id);
  const [accountId, setAccountId] = useState(debt?.accountId ?? "");
  const [amount, setAmount] = useState(
    debt ? moneyInput(debtBalance(state, debt, today), debt.currency) : "",
  );
  const [date, setDate] = useState(today);
  const { error, run } = useActionError();
  if (!debt)
    return <Notice>Долг уже удалён. Закройте окно и выберите другой.</Notice>;
  return (
    <>
      <Notice>
        {debt.direction === "borrowed" ? "Вы возвращаете" : "Вам возвращают"}:{" "}
        {debt.name}. Остаток долга —{" "}
        {money(debtBalance(state, debt, today), false, debt.currency)}. Можно
        вернуть часть суммы.
      </Notice>
      <AmountField
        label={`Сумма возврата, ${currencySymbol(debt.currency)}`}
        accessibilityLabel="Сумма возврата долга"
        value={amount}
        onChangeText={setAmount}
      />
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
        currency={debt.currency}
        label={
          debt.direction === "borrowed"
            ? "Списать со счёта"
            : "Зачислить на счёт"
        }
      />
      <DateField
        label="Дата возврата"
        accessibilityLabel="Дата возврата долга"
        value={date}
        onChangeText={setDate}
      />
      <Notice>
        Подтверждайте только состоявшийся перевод. Приложение запишет движение
        денег один раз и уменьшит остаток долга.
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Записать возврат долга"
        onPress={() =>
          run(() => {
            const parsed = parseMoney(amount, debt.currency);
            if (parsed === null)
              throw new Error("Проверьте сумму возврата в валюте долга.");
            actions.repayDebt({
              debtId: debt.id,
              accountId,
              amount: parsed,
              date,
            });
            notify("Возврат долга записан");
            close();
          })
        }
      />
    </>
  );
}

export function DebtRepaymentForm(
  props: Parameters<typeof DebtRepaymentFormFields>[0],
) {
  const { state } = useFinance();
  if (
    !state.accounts.some(
      (account) => !account.archived && account.kind === "spending",
    )
  )
    return <AccountChoiceEmpty open={props.open} />;
  return <DebtRepaymentFormFields {...props} />;
}
