import type { OpenSheet } from "../../../application/navigation/types";
import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import {
  creditOutstanding,
  creditPaymentRemaining,
} from "../../../domain/debts";
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

function CreditRepaymentFormFields({
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
  const account = state.accounts.find(
    (entry) => entry.id === id && entry.kind === "credit",
  );
  const [fromAccountId, setFromAccountId] = useState(
    state.accounts.find(
      (entry) =>
        !entry.archived &&
        entry.kind === "spending" &&
        (entry.currency ?? "RUB") === (account?.currency ?? "RUB"),
    )?.id ??
      state.accounts.find(
        (entry) => !entry.archived && entry.kind === "spending",
      )!.id,
  );
  const [amount, setAmount] = useState(
    account &&
      accountCurrency(state, fromAccountId) === (account.currency ?? "RUB")
      ? moneyInput(
          creditPaymentRemaining(state, account, today) ||
            creditOutstanding(state, account, today),
          account.currency ?? "RUB",
        )
      : "",
  );
  const [received, setReceived] = useState("");
  const [date, setDate] = useState(today);
  const { error, run } = useActionError();
  if (!account) return <Notice>Кредитная карта не найдена.</Notice>;
  const sourceCurrency = accountCurrency(state, fromAccountId);
  const targetCurrency = account.currency ?? "RUB";
  const foreign = sourceCurrency !== targetCurrency;
  return (
    <>
      <Notice>
        Долг по карте {account.name}:{" "}
        {money(creditOutstanding(state, account, today), false, targetCurrency)}
        . Погашение — перевод между счетами; расходы по покупкам повторно не
        учитываются.
      </Notice>
      <AccountPicker
        selected={fromAccountId}
        onChange={(next) => {
          setFromAccountId(next);
          setAmount("");
          setReceived("");
        }}
        spendingOnly
        label="Откуда перевести"
      />
      <AmountField
        label={`Списано, ${currencySymbol(sourceCurrency)}`}
        accessibilityLabel="Сумма погашения карты"
        value={amount}
        onChangeText={setAmount}
      />
      {foreign && (
        <AmountField
          label={`Зачислено на карту, ${currencySymbol(targetCurrency)}`}
          accessibilityLabel="Зачисление на кредитную карту"
          value={received}
          onChangeText={setReceived}
        />
      )}
      <DateField
        label="Дата перевода"
        accessibilityLabel="Дата погашения карты"
        value={date}
        onChangeText={setDate}
      />
      <ErrorText error={error} />
      <Button
        label="Записать погашение карты"
        onPress={() =>
          run(() => {
            const parsed = parseMoney(amount, sourceCurrency);
            const toAmount = foreign
              ? parseMoney(received, targetCurrency)
              : parsed;
            if (parsed === null || toAmount === null)
              throw new Error(
                "Укажите фактические суммы списания и зачисления.",
              );
            actions.repayCredit({
              accountId: id,
              fromAccountId,
              amount: parsed,
              toAmount,
              date,
            });
            notify("Погашение карты записано");
            close();
          })
        }
      />
    </>
  );
}

export function CreditRepaymentForm(
  props: Parameters<typeof CreditRepaymentFormFields>[0],
) {
  const { state } = useFinance();
  if (
    !state.accounts.some(
      (account) => !account.archived && account.kind === "spending",
    )
  )
    return <AccountChoiceEmpty open={props.open} />;
  return <CreditRepaymentFormFields {...props} />;
}
