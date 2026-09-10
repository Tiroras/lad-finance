import { useState } from "react";
import { View } from "react-native";
import { C, font, Txt, IconTile, Button, Field, Notice, Progress } from "../ui";
import { useFinance } from "../store";
import {
  goalSaved,
  money,
  moneyInput,
  parseMoney,
  uid,
  validateTransaction,
} from "../domain/finance";
import type { Transaction } from "../domain/types";
import type { OpenSheet } from "../navigation/types";
import { ErrorText } from "./ErrorText";
import { AccountPicker } from "./AccountPicker";

export function FundGoalForm({
  id,
  close,
  open,
}: {
  id?: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, update, notify, today } = useFinance();
  const goal = state.goals.find((g) => g.id === id)!;
  const saved = goalSaved(state, goal),
    remaining = Math.max(0, goal.target - saved);
  const [amount, setAmount] = useState(
    moneyInput(Math.min(goal.monthly || remaining, remaining)),
  );
  const [accountId, setAccountId] = useState(
    state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [error, setError] = useState("");
  const save = () => {
    const parsed = parseMoney(amount);
    if (!parsed || parsed > remaining)
      return setError(`Введите сумму от 0,01 ₽ до ${money(remaining, true)}.`);
    const transaction: Transaction = {
      id: uid(),
      type: "transfer",
      title: goal.name,
      amount: parsed,
      date: today,
      category: "other",
      accountId,
      toAccountId: state.accounts.find((a) => a.kind === "savings")!.id,
      goalId: goal.id,
    };
    const validation = validateTransaction(state, transaction);
    if (validation) return setError(validation);
    update((s) => ({ ...s, transactions: [transaction, ...s.transactions] }));
    notify("Вы стали ближе к цели");
    close();
  };
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
          {money(saved)} из {money(goal.target)}
        </Txt>
      </View>
      <Progress value={saved / goal.target} color="#78986A" height={8} />
      {remaining > 0 ? (
        <>
          <Field
            label="Сколько вы отложили, ₽"
            accessibilityLabel="Сумма пополнения цели"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            maxLength={16}
          />
          <AccountPicker
            selected={accountId}
            onChange={setAccountId}
            spendingOnly
            label="Со счёта"
          />
          <Notice>
            Запишем перевод на счёт «
            {state.accounts.find((a) => a.kind === "savings")!.name}». Отмечайте
            пополнение после фактического перевода денег.
          </Notice>
          <ErrorText error={error} />
          <Button label="Записать пополнение" icon="add" onPress={save} />
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
