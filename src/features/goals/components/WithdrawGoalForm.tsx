import { useState } from "react";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  currencySymbol,
  moneyInput,
  parseMoney,
  tryConvertMoney,
} from "../../../domain/currency";
import { goalSaved } from "../../../domain/goals";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  AmountField,
  Button,
  ErrorText,
  Notice,
  Txt,
} from "../../../shared/ui";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import { AccountChoiceEmpty, AccountPicker } from "../../accounts";

export function WithdrawGoalForm({
  id,
  close,
  open,
}: {
  id: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const { money } = useMoney();
  const goal = state.goals.find((entry) => entry.id === id);
  const currency = goal?.currency ?? "RUB";
  const saved = goal ? goalSaved(state, goal, today) : 0;
  const sources = state.accounts.filter(
    (account) =>
      !account.archived &&
      account.kind === "savings" &&
      (account.currency ?? "RUB") === currency,
  );
  const targets = state.accounts.filter(
    (account) => !account.archived && account.kind === "spending",
  );
  const [accountId, setAccountId] = useState(sources[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(
    targets.find((account) => (account.currency ?? "RUB") === currency)?.id ??
      targets[0]?.id ??
      "",
  );
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState<string | null>(null);
  const { error, setError, run } = useActionError();
  const targetCurrency =
    targets.find((account) => account.id === toAccountId)?.currency ?? "RUB";
  const parsed = parseMoney(amount, currency);
  const estimate = tryConvertMoney(
    state,
    parsed ?? 0,
    currency,
    targetCurrency,
  );
  const suggested =
    estimate === null ? "" : moneyInput(estimate, targetCurrency);
  if (!goal)
    return <Notice>Цель уже удалена. Закройте окно и выберите другую.</Notice>;
  const validAccounts =
    sources.some((account) => account.id === accountId) &&
    targets.some((account) => account.id === toAccountId);
  return (
    <>
      <Txt>
        {goal.name} · накоплено {money(saved, true, currency)}
      </Txt>
      <AmountField
        label={`Сколько вывести, ${currencySymbol(currency)}`}
        accessibilityLabel="Сумма вывода из цели"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          setReceived(null);
        }}
      />
      <Button
        label="Вывести всю сумму"
        variant="secondary"
        disabled={saved <= 0}
        onPress={() => {
          setAmount(moneyInput(saved, currency));
          setReceived(null);
        }}
      />
      <AccountPicker
        label="С накопительного счёта"
        selected={accountId}
        onChange={setAccountId}
        savingsOnly
        currency={currency}
      />
      <AccountPicker
        label="На повседневный счёт"
        selected={toAccountId}
        onChange={(value) => {
          setToAccountId(value);
          setReceived(null);
        }}
        spendingOnly
      />
      {!validAccounts && <AccountChoiceEmpty open={open} />}
      {targetCurrency !== currency && (
        <AmountField
          label={`Зачислено, ${currencySymbol(targetCurrency)}`}
          accessibilityLabel="Зачислено из цели"
          value={received ?? suggested}
          onChangeText={setReceived}
        />
      )}
      <Notice>
        Отмечайте вывод после фактического перевода. Накопления цели уменьшатся,
        деньги поступят на повседневный счёт. Это не доход и не расход.
        {targetCurrency !== currency
          ? " При обмене проверьте фактически зачисленную сумму."
          : ""}
      </Notice>
      <ErrorText error={error} />
      <Button
        label="Записать вывод из цели"
        icon="arrow-down-outline"
        disabled={!validAccounts || saved <= 0}
        onPress={() =>
          run(() => {
            if (parsed === null)
              return setError("Введите корректную сумму вывода.");
            const toAmount =
              targetCurrency === currency
                ? parsed
                : parseMoney(received ?? suggested, targetCurrency);
            if (toAmount === null)
              return setError("Введите фактически зачисленную сумму.");
            actions.withdrawGoal({
              goalId: goal.id,
              amount: parsed,
              accountId,
              toAccountId,
              toAmount,
            });
            notify("Вывод из цели записан");
            close();
          })
        }
      />
    </>
  );
}
