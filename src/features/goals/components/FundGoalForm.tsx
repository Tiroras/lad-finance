import { useState } from "react";
import { View } from "react-native";
import {
  accountCurrency,
  currencySymbol,
  tryConvertMoney,
} from "../../../domain/currency";
import { goalSaved, goalContributionOccurrences } from "../../../domain/goals";
import { dateLabel, shiftDate } from "../../../shared/lib/dates";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";
import {
  Button,
  C,
  font,
  IconTile,
  Notice,
  Progress,
  Txt,
  ErrorText,
  AmountField,
  SelectField,
} from "../../../shared/ui";
import { AccountChoiceEmpty, AccountPicker } from "../../accounts";

function FundGoalFormFields({
  id,
  close,
  open,
}: {
  id: string;
  close: () => void;
  open: OpenSheet;
}) {
  const { money, moneyInput, parseMoney } = useMoney();
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const goal = state.goals.find((g) => g.id === id);
  const goalCurrency = goal?.currency ?? "RUB";
  const saved = goal ? goalSaved(state, goal, today) : 0,
    remaining = goal ? Math.max(0, goal.target - saved) : 0;
  const occurrences = goal
    ? goalContributionOccurrences(
        state,
        goal,
        today,
        shiftDate(today, 366),
        today,
      )
    : [];
  const [selectedEvent, setSelectedEvent] = useState(
    occurrences[0]
      ? `${occurrences[0].versionId}:${occurrences[0].occurrenceDate}`
      : "",
  );
  const selected = occurrences.find(
    (entry) => `${entry.versionId}:${entry.occurrenceDate}` === selectedEvent,
  );
  const [amount, setAmount] = useState(
    moneyInput(
      Math.min(
        (occurrences[0]?.amount ?? goal?.monthly) || remaining,
        remaining,
      ),
      goalCurrency,
    ),
  );
  const [accountId, setAccountId] = useState(
    state.accounts.find((a) => !a.archived && a.kind === "spending")!.id,
  );
  const [toAccountId, setToAccountId] = useState(
    state.accounts.find(
      (a) =>
        !a.archived &&
        a.kind === "savings" &&
        (a.currency ?? "RUB") === goalCurrency,
    )?.id ?? "",
  );
  const [debit, setDebit] = useState<string | null>(null);
  const sourceCurrency = accountCurrency(state, accountId);
  const debitEstimate = tryConvertMoney(
    state,
    parseMoney(amount, goalCurrency) ?? 0,
    goalCurrency,
    sourceCurrency,
  );
  const suggestedDebit =
    debitEstimate === null ? "" : moneyInput(debitEstimate, sourceCurrency);
  const { error, setError, run } = useActionError();
  if (!goal)
    return <Notice>Цель уже удалена. Закройте окно и выберите другую.</Notice>;
  const save = () =>
    run(() => {
      const parsed = parseMoney(amount, goalCurrency);
      if (parsed === null)
        return setError("Введите корректную сумму пополнения.");
      actions.fundGoal({
        goalId: goal.id,
        ...(goal.versions && selected
          ? {
              goalVersionId: selected.versionId,
              goalOccurrenceDate: selected.occurrenceDate,
            }
          : {}),
        amount:
          sourceCurrency === goalCurrency
            ? parsed
            : (parseMoney(debit ?? suggestedDebit, sourceCurrency) ?? NaN),
        accountId,
        toAccountId,
        toAmount: parsed,
      });
      notify("Вы стали ближе к цели");
      close();
    });
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
          {money(saved, true, goalCurrency)} из{" "}
          {money(goal.target, true, goalCurrency)}
        </Txt>
      </View>
      <Progress value={saved / goal.target} color="#78986A" height={8} />
      {remaining > 0 ? (
        <>
          {!!goal.versions && occurrences.length > 0 && (
            <SelectField
              label="Взнос по графику цели"
              value={selectedEvent}
              onChange={(value) => {
                setSelectedEvent(value);
                const next = occurrences.find(
                  (entry) =>
                    `${entry.versionId}:${entry.occurrenceDate}` === value,
                );
                if (next) setAmount(moneyInput(next.amount, goalCurrency));
              }}
              options={occurrences.map((entry) => ({
                value: `${entry.versionId}:${entry.occurrenceDate}`,
                label: `${dateLabel(entry.occurrenceDate)} · ${money(entry.amount, false, goalCurrency)}`,
              }))}
            />
          )}
          <AmountField
            label={`Сколько вы отложили, ${currencySymbol(goalCurrency)}`}
            accessibilityLabel="Сумма пополнения цели"
            value={amount}
            onChangeText={setAmount}
          />
          <AccountPicker
            selected={accountId}
            onChange={(id) => {
              setAccountId(id);
              setDebit(null);
            }}
            spendingOnly
            label="Со счёта"
          />
          <AccountPicker
            selected={toAccountId}
            onChange={setToAccountId}
            savingsOnly
            currency={goalCurrency}
            label="На накопительный счёт"
          />
          {!toAccountId && (
            <Button
              label={`Добавить счёт ${goalCurrency}`}
              variant="secondary"
              onPress={() =>
                open({
                  type: "account",
                  currency: goalCurrency,
                  accountKind: "savings",
                })
              }
            />
          )}
          {sourceCurrency !== goalCurrency && (
            <AmountField
              label={`Списано, ${currencySymbol(sourceCurrency)}`}
              accessibilityLabel="Списано на пополнение цели"
              value={debit ?? suggestedDebit}
              onChangeText={setDebit}
            />
          )}
          <Notice>
            Отмечайте пополнение после фактического перевода. При обмене
            проверьте обе суммы; накопительный счёт должен быть в валюте цели.
          </Notice>
          <ErrorText error={error} />
          <Button
            label="Записать пополнение"
            icon="add"
            onPress={save}
            disabled={!toAccountId}
          />
        </>
      ) : (
        <Notice>
          Вы достигли цели. Можно дать себе время порадоваться — или выбрать
          новую мечту.
        </Notice>
      )}
      {saved > 0 && (
        <Button
          label="Вывести из цели"
          variant="secondary"
          onPress={() => open({ type: "withdrawGoal", id: goal.id })}
        />
      )}
      <Button
        label="Изменить цель"
        variant="secondary"
        onPress={() => open({ type: "goal", id: goal.id })}
      />
    </>
  );
}

export function FundGoalForm(props: Parameters<typeof FundGoalFormFields>[0]) {
  const { state } = useFinance();
  if (
    !state.accounts.some(
      (account) => !account.archived && account.kind === "spending",
    )
  )
    return <AccountChoiceEmpty open={props.open} />;
  return <FundGoalFormFields {...props} />;
}
