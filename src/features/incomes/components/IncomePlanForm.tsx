import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import type { PlannedIncome } from "../../../domain/types";
import { AccountChoiceEmpty, AccountPicker } from "../../accounts";
import {
  DeleteButton,
  ErrorText,
  Button,
  Field,
  Notice,
  Segments,
  AmountField,
  DateField,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet, SheetOf } from "../../../application/navigation/types";
import { RecurrenceFields } from "../../payments";
import type { RecurrenceSchedule } from "../../../domain/recurrence";
import { IncomeReceipt } from "./IncomeReceipt";

function IncomePlanFormFields({
  sheet,
  close,
  open,
}: {
  sheet: SheetOf<"income">;
  close: () => void;
  open: OpenSheet;
}) {
  const { moneyInput, parseMoney } = useMoney();
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const original = state.plannedIncomes?.find((p) => p.id === sheet.id);
  const [name, setName] = useState(original?.name ?? "");
  const [amount, setAmount] = useState(
    original
      ? moneyInput(original.amount, accountCurrency(state, original.accountId))
      : "",
  );
  const [date, setDate] = useState(original?.date ?? today);
  const [repeat, setRepeat] = useState<PlannedIncome["repeat"]>(
    original?.repeat ?? "monthly",
  );
  const [schedule, setSchedule] = useState<RecurrenceSchedule | undefined>(
    original?.schedule,
  );
  const [accountId, setAccountId] = useState(
    original?.accountId ??
      state.accounts.find((a) => !a.archived && a.kind === "spending")?.id ??
      "",
  );
  const { error, run } = useActionError();
  return (
    <>
      <Notice>
        Это ожидаемое поступление. План не меняет баланс; фактический доход
        записывается отдельно после получения.
      </Notice>
      <Field
        label="Название дохода"
        accessibilityLabel="Название планируемого дохода"
        value={name}
        onChangeText={setName}
        placeholder="Зарплата, аванс, подработка"
        maxLength={120}
      />
      <AmountField
        label={`Ожидаемая сумма, ${currencySymbol(accountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма планируемого дохода"
        value={amount}
        onChangeText={setAmount}
      />
      <Segments
        value={repeat}
        onChange={setRepeat}
        options={[
          { value: "monthly", label: "Повторять" },
          { value: "once", label: "Один раз" },
        ]}
      />
      {repeat !== "once" && (
        <RecurrenceFields
          schedule={schedule}
          onChange={setSchedule}
          anchor={date}
          locked={!!original}
        />
      )}
      <DateField
        label={repeat === "monthly" ? "Первое поступление" : "Дата поступления"}
        accessibilityLabel="Дата планируемого дохода"
        value={date}
        onChangeText={(value) => {
          setDate(value);
          if (schedule && !original)
            setSchedule({ ...schedule, anchor: value });
        }}
      />
      {repeat === "monthly" && !schedule && (
        <Notice>
          Доход ожидается в то же число каждого месяца, начиная с указанной
          даты. Если такого числа нет — в последний день месяца.
        </Notice>
      )}
      <AccountPicker
        selected={accountId}
        onChange={setAccountId}
        spendingOnly
        currency={
          original ? accountCurrency(state, original.accountId) : undefined
        }
        label="Куда ожидается доход"
      />
      <ErrorText error={error} />
      <Button
        label="Сохранить план дохода"
        onPress={() =>
          run(() => {
            const parsed = parseMoney(
              amount,
              accountCurrency(state, accountId),
            );
            if (parsed === null)
              throw new Error("Введите ожидаемую сумму в валюте счёта.");
            actions.savePlannedIncome({
              id: sheet.id,
              name,
              amount: parsed,
              date,
              repeat,
              schedule:
                repeat === "once"
                  ? undefined
                  : schedule
                    ? { ...schedule, anchor: date }
                    : undefined,
              accountId,
            });
            notify(
              original ? "План дохода обновлён" : "Доход добавлен в прогноз",
            );
            close();
          })
        }
      />
      {original && (
        <>
          <IncomeReceipt plan={original} date={sheet.date} open={open} />
          <DeleteButton
            label="Удалить план дохода"
            explanation="Будущие поступления исчезнут из прогноза. Уже полученные доходы останутся в истории и на счетах."
            onDelete={() =>
              run(() => {
                actions.deletePlannedIncome(original.id);
                notify("План дохода удалён");
                close();
              })
            }
          />
        </>
      )}
    </>
  );
}

export function IncomePlanForm(
  props: Parameters<typeof IncomePlanFormFields>[0],
) {
  const { state } = useFinance();
  if (
    !state.accounts.some(
      (account) => !account.archived && account.kind === "spending",
    )
  )
    return <AccountChoiceEmpty open={props.open} />;
  return <IncomePlanFormFields {...props} />;
}
