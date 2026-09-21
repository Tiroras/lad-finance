import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import { localDate } from "../../../domain/finance";
import type { CategoryId } from "../../../domain/types";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import {
  Button,
  Field,
  Notice,
  Segments,
  DeleteButton,
  ErrorText,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";
import { CategoryPicker } from "../../categories";

export function RecurringForm({
  id,
  close,
}: {
  id?: string;
  close: () => void;
}) {
  const { moneyInput, parseMoney } = useMoney();
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.recurring.find((p) => p.id === id);
  const [name, setName] = useState(original?.name ?? "");
  const [amount, setAmount] = useState(
    original
      ? moneyInput(original.amount, accountCurrency(state, original.accountId))
      : "",
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
  const { error, setError, run } = useActionError();
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, accountCurrency(state, accountId));
      if (parsed === null) return setError("Введите корректную сумму платежа.");
      actions.saveRecurring({
        id,
        name,
        amount: parsed,
        day: Number(day),
        kind,
        category,
        accountId,
        startsOn,
        skippedMonths,
      });
      notify("Платёж сохранён");
      close();
    });
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
        label={`Сумма в месяц, ${currencySymbol(accountCurrency(state, accountId))}`}
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
        currency={
          original ? accountCurrency(state, original.accountId) : undefined
        }
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
          onDelete={() =>
            run(() => {
              actions.deleteRecurring(original.id);
              notify("Платёж удалён из плана");
              close();
            })
          }
        />
      )}
    </>
  );
}
