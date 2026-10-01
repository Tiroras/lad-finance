import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import { localDate } from "../../../domain/finance";
import { shiftDate } from "../../../shared/lib/dates";
import { RecurrenceFields } from "./RecurrenceFields";
import type { RecurrenceSchedule } from "../../../domain/recurrence";
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
  AmountField,
  DateField,
} from "../../../shared/ui";
import { AccountPicker } from "../../accounts";
import { CategoryPicker } from "../../categories";

export function RecurringForm({
  id,
  sourceTransactionId,
  defaultKind,
  close,
}: {
  id?: string;
  sourceTransactionId?: string;
  defaultKind?: "bill" | "subscription";
  close: () => void;
}) {
  const { moneyInput, parseMoney } = useMoney();
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.recurring.find((p) => p.id === id);
  const source = state.transactions.find(
    (t) => t.id === sourceTransactionId && t.type === "expense" && !t.debtId,
  );
  const [name, setName] = useState(original?.name ?? source?.title ?? "");
  const [amount, setAmount] = useState(
    original
      ? moneyInput(original.amount, accountCurrency(state, original.accountId))
      : source
        ? moneyInput(source.amount, accountCurrency(state, source.accountId))
        : "",
  );
  const [day, setDay] = useState(
    String(original?.day ?? (source ? Number(source.date.slice(-2)) : 15)),
  );
  const [kind, setKind] = useState<"bill" | "subscription">(
    original?.kind ?? defaultKind ?? "subscription",
  );
  const [category, setCategory] = useState<CategoryId>(
    original?.category ??
      (state.categories.some((c) => c.id === source?.category && !c.archived)
        ? source!.category
        : "other"),
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      source?.accountId ??
      state.accounts.find((a) => a.kind === "spending")!.id,
  );
  const [startsOn, setStartsOn] = useState(
    original?.startsOn ?? (source ? shiftDate(today, 1) : today),
  );
  const [schedule, setSchedule] = useState<RecurrenceSchedule | undefined>(
    original?.schedule,
  );
  const [skippedDates, setSkippedDates] = useState(
    original?.skippedDates ?? [],
  );
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
        skippedDates,
        schedule: schedule
          ? { ...schedule, anchor: original?.schedule?.anchor ?? startsOn }
          : undefined,
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
      <AmountField
        label={`Сумма одного платежа, ${currencySymbol(accountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма платежа"
        value={amount}
        onChangeText={setAmount}
      />
      <RecurrenceFields
        schedule={schedule}
        onChange={setSchedule}
        anchor={startsOn}
        locked={!!original}
      />
      {!schedule && (
        <Field
          label="День списания · от 1 до 31"
          accessibilityLabel="День списания"
          value={day}
          onChangeText={setDay}
          keyboardType="number-pad"
          maxLength={2}
        />
      )}
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
        currency={
          original ? accountCurrency(state, original.accountId) : undefined
        }
      />
      <DateField
        label="Учитывать с даты"
        accessibilityLabel="Дата начала платежа"
        value={startsOn}
        onChangeText={(value) => {
          setStartsOn(value);
          if (schedule && !original)
            setSchedule({ ...schedule, anchor: value });
        }}
        placeholder={localDate()}
      />
      <CategoryPicker value={category} onChange={setCategory} />
      <Notice>
        Если в месяце нет выбранного числа, платёж планируется на последний день
        месяца. Неотмеченные платежи после даты начала остаются просроченными.
        Реального списания приложение не выполняет.
        {schedule
          ? " Изменение суммы действует с сегодняшнего дня; прошлые обязательства сохраняют прежнюю сумму."
          : " Изменение суммы и дня действует с текущего месяца; прошлые месяцы сохраняют прежние условия."}
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
      {skippedDates.length > 0 && (
        <>
          <Notice>Пропущено платежей: {skippedDates.length}.</Notice>
          <Button
            label="Вернуть все пропущенные платежи"
            variant="secondary"
            onPress={() => setSkippedDates([])}
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
