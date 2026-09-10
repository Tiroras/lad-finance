import { useState } from "react";
import { C, Button, Segments, Field, Notice } from "../ui";
import { useFinance } from "../store";
import { accountBalance, moneyInput, parseMoney, uid } from "../domain/finance";
import type { Account } from "../domain/types";
import { ErrorText } from "./ErrorText";

export function AccountForm({ id, close }: { id?: string; close: () => void }) {
  const { state, update, notify } = useFinance();
  const original = state.accounts.find((a) => a.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(
    original?.kind ?? "spending",
  );
  const [amount, setAmount] = useState(
    original ? moneyInput(accountBalance(state, original.id)) : "0",
  );
  const [error, setError] = useState("");
  const save = () => {
    const parsed = parseMoney(amount);
    if (!name.trim() || name.length > 120 || parsed === null)
      return setError(
        "Укажите название и неотрицательный остаток до 1 млрд ₽.",
      );
    const currentBalance = original ? accountBalance(state, original.id) : 0;
    const openingBalance =
      parsed - currentBalance + (original?.openingBalance ?? 0);
    if (kind === "savings") {
      const saved = state.goals.reduce((n, g) => n + g.initialSaved, 0);
      const otherOpening = state.accounts
        .filter((a) => a.kind === "savings" && a.id !== id)
        .reduce((n, a) => n + a.openingBalance, 0);
      if (openingBalance + otherOpening < saved)
        return setError(
          "Остаток меньше средств, уже распределённых по целям. Сначала освободите нужную сумму в целях.",
        );
    }
    const account: Account = {
      id: original?.id ?? uid(),
      name: name.trim(),
      kind,
      openingBalance,
      icon:
        original?.icon ??
        (kind === "savings" ? "wallet-outline" : "card-outline"),
      color: original?.color ?? C.green,
    };
    update((s) => ({
      ...s,
      accounts: original
        ? s.accounts.map((a) => (a.id === id ? account : a))
        : [...s.accounts, account],
    }));
    notify("Счёт сохранён");
    close();
  };
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
