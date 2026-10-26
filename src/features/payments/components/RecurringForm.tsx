import { isPosted } from "../../../domain/transactionStatus";
import type { OpenSheet } from "../../../application/navigation/types";
import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import { localDate } from "../../../domain/finance";
import { shiftDate } from "../../../shared/lib/dates";
import { RecurrenceFields } from "./RecurrenceFields";
import type { RecurrenceSchedule } from "../../../domain/recurrence";
import {
  paymentTransitionPreview,
  paymentTermsChanged,
  type RecurringInput,
} from "../../../domain/actions/recurring";
import { PaymentTermsHistory } from "./PaymentTermsHistory";
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
  DeleteButton,
  ErrorText,
  AmountField,
  DateField,
} from "../../../shared/ui";
import { AccountChoiceEmpty, AccountPicker } from "../../accounts";
import { CategoryPicker } from "../../categories";

function RecurringFormFields({
  id,
  sourceTransactionId,
  close,
  open,
}: {
  id?: string;
  sourceTransactionId?: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { moneyInput, parseMoney } = useMoney();
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.recurring.find((p) => p.id === id);
  const source = state.transactions.find(
    (t) =>
      t.id === sourceTransactionId &&
      isPosted(t) &&
      t.type === "expense" &&
      !t.debtId,
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
  const [category, setCategory] = useState<CategoryId>(
    original?.category ??
      (state.categories.some((c) => c.id === source?.category && !c.archived)
        ? source!.category
        : "other"),
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      source?.accountId ??
      state.accounts.find((a) => !a.archived && a.kind === "spending")!.id,
  );
  const [startsOn, setStartsOn] = useState(
    original?.startsOn ?? (source ? shiftDate(today, 1) : today),
  );
  const [schedule, setSchedule] = useState<RecurrenceSchedule | undefined>(
    original?.schedule,
  );
  const [effectiveFrom, setEffectiveFrom] = useState(shiftDate(today, 1));
  const [proposed, setProposed] = useState<RecurringInput | null>(null);
  const { error, setError, run } = useActionError();
  const commit = (input: RecurringInput) =>
    run(() => {
      actions.saveRecurring(input);
      notify("Платёж сохранён");
      close();
    });
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, accountCurrency(state, accountId));
      if (parsed === null) return setError("Введите корректную сумму платежа.");
      const input: RecurringInput = {
        id,
        name,
        amount: parsed,
        day: Number(day),
        category,
        accountId,
        startsOn,
        schedule,
        effectiveFrom: original ? effectiveFrom : undefined,
      };
      if (original && paymentTermsChanged(original, input)) setProposed(input);
      else commit(input);
    });
  const preview =
    original && proposed
      ? paymentTransitionPreview(
          state,
          original.id,
          proposed.effectiveFrom!,
          today,
        )
      : undefined;
  return (
    <>
      <Field
        label="Название"
        accessibilityLabel="Название платежа"
        placeholder="Например, домашний интернет"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setProposed(null);
        }}
        maxLength={120}
      />
      <AmountField
        label={`Сумма одного платежа, ${currencySymbol(accountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма платежа"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          setProposed(null);
        }}
      />
      <RecurrenceFields
        schedule={schedule}
        onChange={(value) => {
          setSchedule(value);
          setProposed(null);
        }}
        anchor={original ? effectiveFrom : startsOn}
      />
      {!schedule && (
        <Field
          label="День списания · от 1 до 31"
          accessibilityLabel="День списания"
          value={day}
          onChangeText={(value) => {
            setDay(value);
            setProposed(null);
          }}
          keyboardType="number-pad"
          maxLength={2}
        />
      )}
      <AccountPicker
        selected={accountId}
        onChange={(value) => {
          setAccountId(value);
          setProposed(null);
        }}
        spendingOnly
        currency={
          original ? accountCurrency(state, original.accountId) : undefined
        }
      />
      {original ? (
        <DateField
          label="Новые условия действуют с даты"
          accessibilityLabel="Начало новых условий платежа"
          value={effectiveFrom}
          onChangeText={(value) => {
            setEffectiveFrom(value);
            setProposed(null);
          }}
        />
      ) : (
        <DateField
          label="Учитывать с даты"
          accessibilityLabel="Дата начала платежа"
          value={startsOn}
          onChangeText={(value) => {
            setStartsOn(value);
            if (schedule) setSchedule({ ...schedule, anchor: value });
          }}
          placeholder={localDate()}
        />
      )}
      {original && schedule && (
        <DateField
          label="Опорная дата повторений новых условий"
          accessibilityLabel="Опорная дата графика платежа"
          value={schedule.anchor}
          onChangeText={(anchor) => {
            setSchedule({ ...schedule, anchor });
            setProposed(null);
          }}
        />
      )}
      <CategoryPicker
        value={category}
        onChange={(value) => {
          setCategory(value);
          setProposed(null);
        }}
      />
      <Notice>
        Если в месяце нет выбранного числа, платёж планируется на последний день
        месяца. Неотмеченные платежи после даты начала остаются просроченными.
        Реального списания приложение не выполняет.
        {original &&
          " Новые условия начнутся не раньше завтра. Прежние обязательства сохранят дату, сумму, счёт и категорию. Уже отмеченные будущие события защищены от изменения."}
      </Notice>
      <ErrorText error={error} />
      {proposed && preview ? (
        <>
          <Notice tone={preview.conflicts.length ? "warning" : undefined}>
            С {proposed.effectiveFrom}: {preview.affected.length} будущих
            событий в ближайшие 90 дней будут рассчитаны по новым условиям.
            {preview.replacedVersions.length > 0 &&
              ` Уже назначенные будущие условия с дат ${preview.replacedVersions.map((version) => version.effectiveFrom).join(", ")} будут отменены до начала и сохранены в истории.`}
            {preview.conflicts.length > 0 &&
              ` Конфликты: ${preview.conflicts
                .map((item) => item.date)
                .slice(0, 8)
                .join(
                  ", ",
                )}. Выберите дату не раньше ${preview.suggestedFrom}.`}
            {preview.affected.length > 0 &&
              ` Даты прежнего графика: ${preview.affected
                .slice(0, 8)
                .map((item) => item.date)
                .join(", ")}${preview.affected.length > 8 ? "…" : ""}.`}
          </Notice>
          <Button
            label="Подтвердить новые условия"
            disabled={preview.conflicts.length > 0}
            onPress={() => commit(proposed)}
          />
          <Button
            label="Изменить условия"
            variant="secondary"
            onPress={() => setProposed(null)}
          />
        </>
      ) : (
        <Button label="Сохранить платёж" onPress={save} />
      )}
      {original && <PaymentTermsHistory payment={original} open={open} />}
      {original && (
        <DeleteButton
          label="Удалить из плана"
          explanation="Платёж исчезнет из прогноза. Записанные расходы останутся в истории. Реальные списания у поставщика продолжат действовать."
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

export function RecurringForm(
  props: Parameters<typeof RecurringFormFields>[0],
) {
  const { state } = useFinance();
  if (
    !state.accounts.some(
      (account) => !account.archived && account.kind === "spending",
    )
  )
    return <AccountChoiceEmpty open={props.open} />;
  return <RecurringFormFields {...props} />;
}
