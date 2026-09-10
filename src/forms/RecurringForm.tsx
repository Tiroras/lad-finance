import { useState } from "react";
import { Button, Segments, Field, Notice } from "../ui";
import { useFinance } from "../store";
import {
  changedPaymentHistory,
  localDate,
  moneyInput,
  parseMoney,
  uid,
  validDate,
} from "../domain/finance";
import type { CategoryId } from "../domain/types";
import { ErrorText } from "./ErrorText";
import { AccountPicker } from "./AccountPicker";
import { CategoryPicker } from "./CategoryPicker";
import { DeleteButton } from "./DeleteButton";

export function RecurringForm({
  id,
  close,
}: {
  id?: string;
  close: () => void;
}) {
  const { state, update, notify } = useFinance();
  const original = state.recurring.find((p) => p.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [amount, setAmount] = useState(
    original ? moneyInput(original.amount) : "",
  );
  const [day, setDay] = useState(String(original?.day ?? 15));
  const [kind, setKind] = useState<"bill" | "subscription">(
    original?.kind ?? "subscription",
  );
  const [category, setCategory] = useState<CategoryId>(
    original?.category ?? "other",
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [startsOn, setStartsOn] = useState(original?.startsOn ?? localDate());
  const [skippedMonths, setSkippedMonths] = useState(
    original?.skippedMonths ?? [],
  );
  const [error, setError] = useState("");
  const save = () => {
    const parsed = parseMoney(amount),
      dayNumber = Number(day);
    if (
      !name.trim() ||
      !parsed ||
      !/^\d{1,2}$/.test(day) ||
      dayNumber < 1 ||
      dayNumber > 31
    )
      return setError("Укажите название, сумму больше нуля и день от 1 до 31.");
    if (
      !validDate(startsOn) ||
      startsOn < "2000-01-01" ||
      startsOn > "2100-12-31"
    )
      return setError(
        "Укажите дату начала учёта от 2000 до 2100 года: ГГГГ-ММ-ДД.",
      );
    const payment = {
      id: original?.id ?? uid(),
      name: name.trim(),
      amount: parsed,
      day: dayNumber,
      kind,
      category,
      accountId,
      startsOn,
      skippedMonths,
      history: changedPaymentHistory(original, parsed, dayNumber),
      active: original?.active ?? true,
      icon:
        original?.icon ??
        ((kind === "bill" ? "home-outline" : "musical-notes-outline") as
          "home-outline" | "musical-notes-outline"),
      color: original?.color ?? "#EEEBF5",
    };
    update((s) => ({
      ...s,
      recurring: original
        ? s.recurring.map((p) => (p.id === id ? payment : p))
        : [...s.recurring, payment],
    }));
    notify("Платёж сохранён");
    close();
  };
  return (
    <>
      <Segments
        value={kind}
        onChange={setKind}
        options={[
          { value: "subscription", label: "Подписка" },
          { value: "bill", label: "Обязательный платёж" },
        ]}
      />
      <Field
        label="Название"
        accessibilityLabel="Название платежа"
        placeholder="Например, домашний интернет"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Field
        label="Сумма в месяц, ₽"
        accessibilityLabel="Сумма платежа"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={16}
      />
      <Field
        label="День списания · от 1 до 31"
        accessibilityLabel="День списания"
        value={day}
        onChangeText={setDay}
        keyboardType="number-pad"
        maxLength={2}
      />
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
      />
      <Field
        label="Учитывать с даты · ГГГГ-ММ-ДД"
        accessibilityLabel="Дата начала платежа"
        value={startsOn}
        onChangeText={setStartsOn}
        placeholder={localDate()}
        maxLength={10}
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <Notice>
        Если в месяце нет выбранного числа, платёж планируется на последний день
        месяца. Неотмеченные платежи после даты начала остаются просроченными.
        Реального списания приложение не выполняет. Изменение суммы и дня
        действует с текущего месяца; прошлые месяцы сохраняют прежние условия.
      </Notice>
      <ErrorText error={error} />
      {skippedMonths.length > 0 && (
        <>
          <Notice>
            Пропущено месяцев: {skippedMonths.length}. Чтобы снова учитывать эти
            обязательства, верните их и сохраните платёж.
          </Notice>
          <Button
            label="Вернуть все пропущенные месяцы"
            variant="secondary"
            onPress={() => setSkippedMonths([])}
          />
        </>
      )}
      <Button label="Сохранить платёж" onPress={save} />
      {original && (
        <DeleteButton
          label="Удалить из плана"
          explanation="Платёж исчезнет из прогноза. Записанные расходы останутся в истории. Подписка в самом сервисе продолжит действовать."
          onDelete={() => {
            update((s) => ({
              ...s,
              recurring: s.recurring.filter((p) => p.id !== id),
              transactions: s.transactions.map((t) =>
                t.recurringId === id
                  ? { ...t, recurringId: undefined, occurrenceDate: undefined }
                  : t,
              ),
            }));
            notify("Платёж удалён из плана");
            close();
          }}
        />
      )}
    </>
  );
}
