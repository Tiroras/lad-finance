import { useActionError } from "../hooks/useActionError";
import { useFinanceActions } from "../hooks/useFinanceActions";
import { useState } from "react";
import { Button, Segments, Field, Notice } from "../ui";
import { useFinance } from "../store";
import { accountBalance, moneyInput, parseMoney } from "../domain/finance";
import type { Account } from "../domain/types";
import { ErrorText } from "./ErrorText";

export function AccountForm({ id, close }: { id?: string; close: () => void }) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.accounts.find((a) => a.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(
    original?.kind ?? "spending",
  );
  const [amount, setAmount] = useState(
    original ? moneyInput(accountBalance(state, original.id)) : "0",
  );
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount);
      if (parsed === null)
        return setError("Укажите неотрицательный остаток до 1 млрд ₽.");
      actions.saveAccount({ id, name, kind, balance: parsed });
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
        <Segments
          value={kind}
          onChange={setKind}
          options={[
            { value: "spending", label: "Повседневный" },
            { value: "savings", label: "Накопительный" },
          ]}
        />
      )}
      <Field
        label="Текущий остаток, ₽"
        accessibilityLabel="Остаток на счёте"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Корректировка остатка не считается доходом или расходом.{" "}
        {kind === "savings"
          ? "Накопительный счёт не входит в сумму «можно потратить»."
          : "Доходы и расходы записывайте в операциях."}
      </Notice>
      <ErrorText error={error} />
      <Button label="Сохранить счёт" onPress={save} />
    </>
  );
}
