import type { CurrencyCode } from "../../../domain/currency";
import { CurrencyPicker } from "../../currencies";
import { Field, Notice } from "../../../shared/ui";

export function OnboardingBalanceStep({
  name,
  accountName,
  balance,
  savings,
  currency,
  setName,
  setAccountName,
  setBalance,
  setSavings,
  setCurrency,
}: {
  name: string;
  accountName: string;
  balance: string;
  savings: string;
  currency: CurrencyCode;
  setName: (v: string) => void;
  setAccountName: (v: string) => void;
  setBalance: (v: string) => void;
  setSavings: (v: string) => void;
  setCurrency: (v: CurrencyCode) => void;
}) {
  return (
    <>
      <Field
        accessibilityLabel="Ваше имя"
        label="Ваше имя"
        value={name}
        onChangeText={setName}
        maxLength={40}
      />
      <Field
        accessibilityLabel="Название основного счёта"
        label="Название основного счёта"
        value={accountName}
        onChangeText={setAccountName}
        maxLength={120}
      />
      <CurrencyPicker value={currency} onChange={setCurrency} />
      <Field
        label={`Сейчас на основном счёте, ${currency}`}
        accessibilityLabel="Начальный остаток"
        value={balance}
        onChangeText={setBalance}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Field
        label={`Уже отложено на накопления, ${currency}`}
        accessibilityLabel="Начальные накопления"
        value={savings}
        onChangeText={setSavings}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Notice>
        Это текущие остатки. Они не появятся в доходах. Накопления будут
        храниться на отдельном счёте и не войдут в доступную сумму на день.
        Другие счета можно добавить позже.
      </Notice>
    </>
  );
}
