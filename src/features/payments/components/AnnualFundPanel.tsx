import { useState } from "react";
import type { OpenSheet } from "../../../application/navigation/types";
import { accountAvailability } from "../../../domain/accountBalances";
import { accountCurrency } from "../../../domain/currency";
import {
  annualFundStartDate,
  goalFundCoverage,
  goalFundCycleForPayment,
} from "../../../domain/goalFunds";
import { goalSaved } from "../../../domain/goals";
import {
  paymentPending,
  resolvePaymentOccurrence,
} from "../../../domain/payments";
import { dateLabel } from "../../../shared/lib/dates";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  Button,
  Card,
  C,
  ErrorText,
  Field,
  font,
  Notice,
  SelectField,
  Txt,
} from "../../../shared/ui";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";

export function AnnualFundPanel({
  recurringId,
  date,
  versionId,
  open,
  onPaid,
}: {
  recurringId: string;
  date: string;
  versionId?: string;
  open: OpenSheet;
  onPaid: () => void;
}) {
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const { money, moneyInput, parseMoney } = useMoney();
  const { error, run } = useActionError();
  const [creating, setCreating] = useState(false);
  const [goalId, setGoalId] = useState("");
  const [monthly, setMonthly] = useState<string>();
  const [savingsId, setSavingsId] = useState("");
  const [releaseInput, setReleaseInput] = useState<string>();
  const [confirmation, setConfirmation] = useState<{
    amount: number;
    savingsId: string;
  }>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const template = state.recurring.find((entry) => entry.id === recurringId);
  const occurrence =
    template && resolvePaymentOccurrence(template, date, versionId);
  if (!occurrence || occurrence.payment.schedule?.unit !== "year") return null;
  const currency = accountCurrency(state, occurrence.payment.accountId);
  const cycle = goalFundCycleForPayment(
    state,
    recurringId,
    date,
    occurrence.versionId,
  );
  const goal = state.goals.find((entry) => entry.id === cycle?.goalId);
  const pending = paymentPending(state, template!, date, occurrence.versionId);
  const savings = state.accounts.filter(
    (entry) =>
      entry.kind === "savings" &&
      !entry.archived &&
      accountCurrency(state, entry.id) === currency,
  );
  const coverage = cycle
    ? goalFundCoverage(state, cycle, today, today, false)
    : undefined;
  const selectedSavings = savingsId || savings[0]?.id || "";
  const months = Math.max(
    1,
    (Number(date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) -
      Number(today.slice(5, 7)),
  );
  const suggestedMonthly = Math.ceil(occurrence.payment.amount / months);
  const selectableGoals = state.goals.filter(
    (entry) =>
      (entry.currency ?? "RUB") === currency &&
      goalSaved(state, entry, today) <= occurrence.payment.amount &&
      !state.goalFundCycles?.some(
        (candidate) =>
          candidate.goalId === entry.id && candidate.status === "active",
      ),
  );
  const selectedGoal = selectableGoals.find((entry) => entry.id === goalId);
  const boundary = annualFundStartDate(state, selectedGoal, today);
  const previouslyPaid = state.goalFundCycles?.some(
    (entry) => entry.goalId === goal?.id && entry.status === "paid",
  );
  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <Txt style={{ fontFamily: font.bold }}>Годовой фонд</Txt>
      <ErrorText error={error} />
      {cycle?.status === "paid" ? (
        <>
          <Notice>
            Цикл за{" "}
            {dateLabel(date, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            оплачен. История взносов сохранена; следующий цикл создаётся
            отдельно для следующего годового платежа.
          </Notice>
          {goal && (
            <Button
              label="Открыть цель фонда"
              variant="secondary"
              onPress={() => open({ type: "goal", id: goal.id })}
            />
          )}
        </>
      ) : cycle && goal ? (
        <>
          <Txt>
            {goal.name}: накоплено {money(coverage!.saved, false, currency)} из{" "}
            {money(occurrence.payment.amount, false, currency)}.
          </Txt>
          <Notice>
            При оплате подготовленные деньги вернутся на повседневный счёт,
            затем запишется полный расход. Будущие взносы не считаются
            накопленными деньгами.
          </Notice>
          <Button
            label="Открыть цель фонда"
            variant="secondary"
            onPress={() => open({ type: "goal", id: goal.id })}
          />
          {pending ? (
            <Notice tone="warning">
              Сначала отмените ожидаемое списание. После этого оплатите
              обязательство из фонда одним действием.
            </Notice>
          ) : (
            <>
              {coverage!.saved > 0 && (
                <>
                  <SelectField
                    label="Накопительный счёт для оплаты фонда"
                    value={selectedSavings}
                    options={savings.map((entry) => ({
                      value: entry.id,
                      label: `${entry.name} · ${money(accountAvailability(state, entry.id, today).available, false, currency)}`,
                    }))}
                    onChange={(value) => {
                      setSavingsId(value);
                      setConfirmation(undefined);
                    }}
                  />
                  <Field
                    label="Вернуть из фонда"
                    accessibilityLabel="Сумма возврата из годового фонда"
                    keyboardType="decimal-pad"
                    value={
                      releaseInput ?? moneyInput(coverage!.amount, currency)
                    }
                    onChangeText={(value) => {
                      setReleaseInput(value);
                      setConfirmation(undefined);
                    }}
                  />
                </>
              )}
              <Button
                label="Подготовить оплату из фонда"
                onPress={() =>
                  run(() => {
                    const amount = coverage!.saved
                      ? parseMoney(
                          releaseInput ??
                            moneyInput(coverage!.amount, currency),
                          currency,
                        )
                      : 0;
                    if (
                      amount === null ||
                      amount < 0 ||
                      amount > coverage!.amount
                    )
                      throw new Error(
                        "Укажите сумму возврата не больше накопленного и полного платежа.",
                      );
                    if (
                      amount > 0 &&
                      (!selectedSavings ||
                        amount >
                          accountAvailability(state, selectedSavings, today)
                            .available)
                    )
                      throw new Error(
                        "Выберите накопительный счёт с достаточной доступной суммой.",
                      );
                    setConfirmation({ amount, savingsId: selectedSavings });
                  })
                }
              />
              {confirmation && (
                <>
                  <Notice tone="warning">
                    Вернуть {money(confirmation.amount, false, currency)} из
                    накоплений и записать полный расход{" "}
                    {money(occurrence.payment.amount, false, currency)} сегодня,{" "}
                    {dateLabel(today)}? Недостающая часть{" "}
                    {money(
                      occurrence.payment.amount - confirmation.amount,
                      false,
                      currency,
                    )}{" "}
                    будет оплачена повседневными деньгами. Это запись уже
                    выполненной оплаты.
                  </Notice>
                  <Button
                    label="Подтвердить оплату из фонда"
                    onPress={() =>
                      run(() => {
                        actions.payFundedPayment({
                          cycleId: cycle.id,
                          savingsAccountId: confirmation.savingsId,
                          releaseAmount: confirmation.amount,
                        });
                        notify("Возврат накоплений и полная оплата записаны");
                        onPaid();
                      })
                    }
                  />
                  <Button
                    label="Отмена оплаты из фонда"
                    variant="secondary"
                    onPress={() => setConfirmation(undefined)}
                  />
                </>
              )}
            </>
          )}
          <Button
            label="Отменить связь фонда с платежом"
            variant="secondary"
            onPress={() => setConfirmCancel(true)}
          />
          {confirmCancel && (
            <>
              <Notice tone="warning">
                Цель, её условия, накопления и переводы сохранятся. Полный
                платёж снова будет учтён отдельно от неё.{" "}
                {previouslyPaid
                  ? "Взносы останутся приостановлены до явного создания нового цикла."
                  : "Цель продолжит установленный график."}
              </Notice>
              <Button
                label="Подтвердить отмену связи фонда"
                variant="danger"
                onPress={() =>
                  run(() => {
                    actions.cancelAnnualFund(cycle.id);
                    setConfirmCancel(false);
                    notify("Связь отменена; накопления сохранены");
                  })
                }
              />
              <Button
                label="Сохранить связь фонда"
                variant="secondary"
                onPress={() => setConfirmCancel(false)}
              />
            </>
          )}
        </>
      ) : date < today ? (
        <Notice>Для подготовки фонда выберите будущий годовой платёж.</Notice>
      ) : creating ? (
        <>
          <SelectField
            label="Цель годового фонда"
            value={goalId}
            options={[
              { value: "", label: "Создать новую цель" },
              ...selectableGoals.map((entry) => ({
                value: entry.id,
                label: entry.name,
              })),
            ]}
            onChange={setGoalId}
          />
          <Field
            label="Плановый взнос в месяц"
            accessibilityLabel="Ежемесячный взнос годового фонда"
            value={monthly ?? moneyInput(suggestedMonthly, currency)}
            keyboardType="decimal-pad"
            onChangeText={setMonthly}
          />
          <Notice>
            {selectedGoal
              ? `Изменить цель «${selectedGoal.name}»: новая сумма вместо ${money(selectedGoal.target, true, currency)} — `
              : "Создать цель на "}
            {money(occurrence.payment.amount, true, currency)} и связать её с
            платежом за{" "}
            {dateLabel(date, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            ?{" "}
            {date === today
              ? "Новые взносы для сегодняшней оплаты не планируются."
              : `Будет установлен месячный график ${state.settings.forecast?.goalDay ?? 31}-го числа с ${dateLabel(boundary, { day: "numeric", month: "long", year: "numeric" })}; срок — дата платежа. Сумма каждого взноса указана выше. Прежний график после этой границы заменяется.`}{" "}
            Деньги не перемещаются. При отмене связи новые условия цели
            сохранятся. Следующий годовой цикл создаётся вручную.
          </Notice>
          <Button
            label="Подтвердить создание фонда"
            onPress={() =>
              run(() => {
                const amount = parseMoney(
                  monthly ?? moneyInput(suggestedMonthly, currency),
                  currency,
                );
                if (amount === null || amount < 0)
                  throw new Error("Укажите неотрицательный плановый взнос.");
                actions.createAnnualFund({
                  recurringId,
                  occurrenceDate: date,
                  recurringVersionId: occurrence.versionId,
                  goalId: goalId || undefined,
                  monthly: amount,
                });
                setCreating(false);
                notify("Годовой фонд создан");
              })
            }
          />
          <Button
            label="Отмена создания фонда"
            variant="secondary"
            onPress={() => setCreating(false)}
          />
        </>
      ) : (
        <>
          <Txt style={{ color: C.muted, fontSize: 12 }}>
            Свяжите отдельную цель с этим годовым обязательством. Накопленные
            средства уменьшат будущую нагрузку на повседневные деньги.
          </Txt>
          <Button
            label="Создать годовой фонд"
            variant="secondary"
            disabled={!!pending}
            onPress={() => setCreating(true)}
          />
        </>
      )}
    </Card>
  );
}
