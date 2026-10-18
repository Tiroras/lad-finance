import { useState } from "react";
import { accountCurrency, currencySymbol } from "../../../domain/currency";
import type { PlannedIncome } from "../../../domain/types";
import type { IncomeInput } from "../../../domain/actions/incomes";
import {
  incomeTransitionConflicts,
  incomeTermsChanged,
} from "../../../domain/actions/incomes";
import { incomeOccurrences, incomeVersions } from "../../../domain/incomes";
import { dateLabel, shiftDate, validDate } from "../../../shared/lib/dates";
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
  Card,
  Txt,
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
import { IncomePlanHistory } from "./IncomePlanHistory";

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
  const [effectiveFrom, setEffectiveFrom] = useState(shiftDate(today, 1));
  const [preview, setPreview] = useState<IncomeInput | null>(null);
  const { error, run } = useActionError();
  function revise<T>(setValue: (value: T) => void) {
    return (value: T) => {
      setPreview(null);
      setValue(value);
    };
  }
  const commit = (input: IncomeInput) => {
    actions.savePlannedIncome(input);
    notify(original ? "План дохода обновлён" : "Доход добавлен в прогноз");
    close();
  };
  const previewBoundary = preview?.effectiveFrom;
  const affected =
    original && previewBoundary && validDate(previewBoundary)
      ? incomeOccurrences(
          state,
          previewBoundary,
          shiftDate(previewBoundary, 90),
          today,
        ).filter(
          (entry) =>
            entry.plan.id === original.id &&
            entry.occurrenceDate >= previewBoundary,
        )
      : [];
  const replaced =
    original && previewBoundary
      ? incomeVersions(original).filter(
          (version) =>
            !version.voided && version.effectiveFrom >= previewBoundary,
        )
      : [];
  const conflicts =
    original && previewBoundary && validDate(previewBoundary)
      ? [
          ...new Set(
            incomeVersions(original)
              .filter((version) => !version.voided)
              .flatMap((version) =>
                incomeTransitionConflicts(
                  state,
                  original,
                  version.id,
                  previewBoundary,
                ),
              ),
          ),
        ].sort()
      : [];
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
        onChangeText={revise(setName)}
        placeholder="Зарплата, аванс, подработка"
        maxLength={120}
      />
      <AmountField
        label={`Ожидаемая сумма, ${currencySymbol(accountCurrency(state, accountId))}`}
        accessibilityLabel="Сумма планируемого дохода"
        value={amount}
        onChangeText={revise(setAmount)}
      />
      <Segments
        value={repeat}
        onChange={revise(setRepeat)}
        options={[
          { value: "monthly", label: "Повторять" },
          { value: "once", label: "Один раз" },
        ]}
      />
      {repeat !== "once" && (
        <RecurrenceFields
          schedule={schedule}
          onChange={revise(setSchedule)}
          anchor={date}
        />
      )}
      <DateField
        label={repeat === "monthly" ? "Первое поступление" : "Дата поступления"}
        accessibilityLabel="Дата планируемого дохода"
        value={date}
        onChangeText={(value) => {
          setPreview(null);
          setDate(value);
          if (schedule) setSchedule({ ...schedule, anchor: value });
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
        onChange={revise(setAccountId)}
        spendingOnly
        currency={
          original ? accountCurrency(state, original.accountId) : undefined
        }
        label="Куда ожидается доход"
      />
      {original && (
        <>
          <DateField
            label="Новые условия дохода с"
            value={effectiveFrom}
            onChangeText={revise(setEffectiveFrom)}
          />
          <Notice>
            Изменение суммы, счёта или графика создаёт отдельную версию не
            раньше завтра. Старые поступления сохранят свои условия. Название
            можно исправить сразу.
          </Notice>
        </>
      )}
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
            const input: IncomeInput = {
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
              ...(original ? { effectiveFrom } : {}),
            };
            if (original && incomeTermsChanged(original, input)) {
              if (!validDate(effectiveFrom))
                throw new Error(
                  "Укажите корректную дату начала новых условий.",
                );
              setPreview(input);
            } else commit(input);
          })
        }
      />
      {preview && original && (
        <Card style={{ gap: 12 }}>
          <Txt>
            Новые условия с {dateLabel(preview.effectiveFrom!)}: {preview.name},{" "}
            {moneyInput(
              preview.amount,
              accountCurrency(state, preview.accountId),
            )}{" "}
            {currencySymbol(accountCurrency(state, preview.accountId))}. Сумма и
            график будут применяться к исходным датам начиная с этой границы.
            Уже возникшие события останутся прежними.
          </Txt>
          <Txt>
            Ближайшие события за 90 дней:{" "}
            {affected
              .slice(0, 12)
              .map((entry) => dateLabel(entry.occurrenceDate))
              .join(", ") || "нет"}
            {affected.length > 12 ? ` и ещё ${affected.length - 12}` : ""}.
          </Txt>
          {!!replaced.length && (
            <Notice>
              Будущих версий будет заменено: {replaced.length}. Они останутся в
              истории с отметкой «Отменены до начала действия»; уже вступившие
              условия сохранятся.
            </Notice>
          )}
          {!!conflicts.length && (
            <Notice>
              Проверьте границу: затронуты закреплённые события{" "}
              {conflicts
                .slice(0, 12)
                .map((value) => dateLabel(value))
                .join(", ")}
              . Изменение условий будет отклонено до выбора более поздней
              границы.
            </Notice>
          )}
          <Button
            label="Подтвердить новые условия дохода"
            onPress={() => run(() => commit(preview))}
          />
          <Button
            label="Вернуться к условиям дохода"
            variant="secondary"
            onPress={() => setPreview(null)}
          />
        </Card>
      )}
      {original && (
        <>
          <IncomePlanHistory plan={original} />
          <IncomeReceipt
            key={`${original.id}:${sheet.date ?? ""}:${sheet.versionId ?? ""}`}
            plan={original}
            date={sheet.date}
            versionId={sheet.versionId}
            open={open}
          />
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
