import { useState } from "react";
import { View } from "react-native";
import {
  accountCurrency,
  currencySymbol,
  tryConvertMoney,
} from "../../../domain/currency";
import { goalSaved } from "../../../domain/finance";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  Button,
  C,
  Field,
  font,
  IconTile,
  Notice,
  Progress,
  Txt,
  ErrorText,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";

export function FundGoalForm({
  id,
  close,
  open,
}: {
  id?: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { money, moneyInput, parseMoney } = useMoney();
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const goal = state.goals.find((g) => g.id === id)!;
  const goalCurrency = goal.currency ?? "RUB";
  const saved = goalSaved(state, goal, today),
    remaining = Math.max(0, goal.target - saved);
  const [amount, setAmount] = useState(
    moneyInput(Math.min(goal.monthly || remaining, remaining), goalCurrency),
  );
  const [accountId, setAccountId] = useState(
    state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [toAccountId, setToAccountId] = useState(
    state.accounts.find(
      (a) => a.kind === "savings" && (a.currency ?? "RUB") === goalCurrency,
    )?.id ?? "",
  );
  const [debit, setDebit] = useState<string | null>(null);
  const sourceCurrency = accountCurrency(state, accountId);
  const debitEstimate = tryConvertMoney(
    state,
    parseMoney(amount, goalCurrency) ?? 0,
    goalCurrency,
    sourceCurrency,
  );
  const suggestedDebit =
    debitEstimate === null ? "" : moneyInput(debitEstimate, sourceCurrency);
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, goalCurrency);
      if (parsed === null)
        return setError("Введите корректную сумму пополнения.");
      actions.fundGoal({
        goalId: goal.id,
        amount:
          sourceCurrency === goalCurrency
            ? parsed
            : (parseMoney(debit ?? suggestedDebit, sourceCurrency) ?? NaN),
        accountId,
        toAccountId,
        toAmount: parsed,
      });
      notify("Вы стали ближе к цели");
      close();
    });
  return (
    <>
      <View style={{ alignItems: "center", gap: 14 }}>
        <IconTile name={goal.icon} background={goal.color} size={64} />
        <Txt
          style={{ fontFamily: font.bold, fontSize: 21, textAlign: "center" }}
        >
          {goal.name}
        </Txt>
        <Txt style={{ fontSize: 12, color: C.muted }}>
          {money(saved, true, goalCurrency)} из{" "}
          {money(goal.target, true, goalCurrency)}
        </Txt>
      </View>
      <Progress value={saved / goal.target} color="#78986A" height={8} />
      {remaining > 0 ? (
        <>
          <Field
            label={`Сколько вы отложили, ${currencySymbol(goalCurrency)}`}
            accessibilityLabel="Сумма пополнения цели"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            maxLength={16}
          />
          <AccountPicker
            selected={accountId}
            onChange={(id) => {
              setAccountId(id);
              setDebit(null);
            }}
            spendingOnly
            label="Со счёта"
          />
          <AccountPicker
            selected={toAccountId}
            onChange={setToAccountId}
            savingsOnly
            currency={goalCurrency}
            label="На накопительный счёт"
          />
          {!toAccountId && (
            <Button
              label={`Добавить счёт ${goalCurrency}`}
              variant="secondary"
              onPress={() =>
                open({
                  type: "account",
                  currency: goalCurrency,
                  accountKind: "savings",
                })
              }
            />
          )}
          {sourceCurrency !== goalCurrency && (
            <Field
              label={`Списано, ${currencySymbol(sourceCurrency)}`}
              accessibilityLabel="Списано на пополнение цели"
              value={debit ?? suggestedDebit}
              onChangeText={setDebit}
              keyboardType="decimal-pad"
              maxLength={16}
            />
          )}
          <Notice>
            Отмечайте пополнение после фактического перевода. При обмене
            проверьте обе суммы; накопительный счёт должен быть в валюте цели.
          </Notice>
          <ErrorText error={error} />
          <Button
            label="Записать пополнение"
            icon="add"
            onPress={save}
            disabled={!toAccountId}
          />
        </>
      ) : (
        <Notice>
          Вы достигли цели. Можно дать себе время порадоваться — или выбрать
          новую мечту.
        </Notice>
      )}
      <Button
        label="Изменить цель"
        variant="secondary"
        onPress={() => open({ type: "goal", id: goal.id })}
      />
    </>
  );
}
