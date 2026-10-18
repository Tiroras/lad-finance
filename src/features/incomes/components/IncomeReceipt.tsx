import { useEffect, useState } from "react";
import { View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import { dateLabel, daysBetween, uid } from "../../../domain/finance";
import {
  canLinkIncome,
  incomeOccurrences,
  incomeReceived,
  incomePending,
  incomeVersions,
  resolveIncomeOccurrence,
} from "../../../domain/incomes";
import { shiftDate } from "../../../shared/lib/dates";
import type { PlannedIncome } from "../../../domain/types";
import {
  ErrorText,
  Button,
  C,
  Notice,
  Txt,
  DateField,
  Chip,
  Row,
  Card,
  font,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet } from "../../../application/navigation/types";

export function IncomeReceipt({
  plan,
  date,
  versionId,
  open,
}: {
  plan: PlannedIncome;
  date?: string;
  versionId?: string;
  open: OpenSheet;
}) {
  const { money } = useMoney();
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const versions = incomeVersions(plan);
  const available = incomeOccurrences(
    state,
    shiftDate(today, -366),
    shiftDate(today, 367),
    today,
  ).filter((entry) => entry.plan.id === plan.id);
  const nearest =
    available.find((entry) => entry.date >= today) ?? available.at(-1);
  const [selectedVersion, setSelectedVersion] = useState(
    versionId ??
      nearest?.versionId ??
      versions.filter((version) => !version.voided).at(-1)!.id,
  );
  const [occurrenceDate, setOccurrenceDate] = useState(
    date ?? nearest?.occurrenceDate ?? plan.date,
  );
  const selected = resolveIncomeOccurrence(
    plan,
    occurrenceDate,
    selectedVersion,
  );
  const [expectedDate, setExpectedDate] = useState(selected?.date ?? today);
  const [confirmation, setConfirmation] = useState<
    "move" | "cancel" | "restore" | null
  >(null);
  useEffect(() => {
    setExpectedDate(selected?.date ?? today);
    setConfirmation(null);
  }, [occurrenceDate, selectedVersion, selected?.date, today]);
  const recorded = incomeReceived(
    state,
    plan,
    occurrenceDate,
    today,
    selectedVersion,
  );
  const pending = incomePending(state, plan, occurrenceDate, selectedVersion);
  const candidates = selected
    ? state.transactions
        .filter((transaction) =>
          canLinkIncome(transaction, selected.plan, today),
        )
        .sort(
          (a, b) =>
            Math.abs(daysBetween(a.date, occurrenceDate)) -
            Math.abs(daysBetween(b.date, occurrenceDate)),
        )
        .slice(0, 8)
    : [];
  const receive = (transactionId?: string) =>
    run(() => {
      actions.receivePlannedIncome(
        plan.id,
        occurrenceDate,
        transactionId,
        selectedVersion,
      );
      notify(transactionId ? "Поступление связано с планом" : "Доход записан");
    });
  return (
    <View style={{ gap: 12 }}>
      <Txt style={{ fontFamily: font.bold }}>Отдельное поступление</Txt>
      {versions.length > 1 && (
        <Row style={{ flexWrap: "wrap", gap: 8 }}>
          {versions
            .filter((version) => !version.voided)
            .map((version) => (
              <Chip
                key={version.id}
                label={`Условия с ${dateLabel(version.effectiveFrom, { day: "numeric", month: "long", year: "numeric" })}`}
                active={selectedVersion === version.id}
                onPress={() => setSelectedVersion(version.id)}
              />
            ))}
        </Row>
      )}
      <DateField
        label="Исходная дата поступления"
        value={occurrenceDate}
        onChangeText={setOccurrenceDate}
      />
      <Notice>
        Выберите дату исходного графика. Перенос изменяет ожидаемый день,
        сохраняя отдельное поступление и его условия.
      </Notice>
      <ErrorText error={error} />
      {!selected ? (
        <Notice>
          На эту исходную дату в выбранной версии поступления нет. Проверьте
          график и границы условий.
        </Notice>
      ) : (
        <>
          <Txt style={{ fontSize: 12, color: C.muted }}>
            По плану {dateLabel(occurrenceDate)} · ожидается{" "}
            {dateLabel(selected.date)} ·{" "}
            {money(
              selected.plan.amount,
              false,
              accountCurrency(state, selected.plan.accountId),
            )}
          </Txt>
          {recorded ? (
            <>
              <Notice>
                Поступление уже в истории операций. В прогнозе оно повторно не
                учитывается. Перенос плана не изменяет дату записанного факта.
              </Notice>
              <Button
                label="Открыть полученный доход"
                variant="secondary"
                onPress={() => open({ type: "transaction", id: recorded.id })}
              />
            </>
          ) : pending ? (
            <>
              <Notice>
                Поступление ожидает проведения. Оно ещё не увеличивает
                фактический остаток. Для переноса или отмены события сначала
                проведите или отмените ожидание.
              </Notice>
              <Button
                label="Открыть ожидаемое поступление"
                variant="secondary"
                onPress={() => open({ type: "transaction", id: pending.id })}
              />
            </>
          ) : (
            <>
              {selected.cancelled ? (
                <>
                  <Notice>
                    Поступление отменено: оно не участвует в прогнозе и расчёте
                    доступных денег.
                  </Notice>
                  <Button
                    label="Вернуть поступление в план"
                    variant="secondary"
                    onPress={() => setConfirmation("restore")}
                  />
                </>
              ) : (
                <>
                  <Notice>
                    Отмечайте получение, когда деньги действительно пришли.
                    Новый факт записывается сегодняшним числом по условиям
                    выбранного события.
                  </Notice>
                  {candidates.length > 0 && (
                    <>
                      <Notice>
                        В истории есть похожие доходы. Связь с планом не
                        зачисляет деньги повторно.
                      </Notice>
                      {candidates.map((transaction) => (
                        <Button
                          key={transaction.id}
                          label={`Связать доход: ${transaction.title} · ${dateLabel(transaction.date)}`}
                          variant="secondary"
                          onPress={() => receive(transaction.id)}
                        />
                      ))}
                    </>
                  )}
                  <Button
                    label="Доход получен — записать"
                    variant="secondary"
                    onPress={() => receive()}
                  />
                  <Button
                    label="Ожидать поступление по плану"
                    variant="secondary"
                    onPress={() =>
                      run(() => {
                        const id = uid();
                        actions.saveTransaction({
                          createId: id,
                          type: "income",
                          status: "pending",
                          title: plan.name,
                          amount: selected.plan.amount,
                          date: today,
                          expectedDate: selected.date,
                          accountId: selected.plan.accountId,
                          category: "other",
                          plannedIncomeId: plan.id,
                          incomeOccurrenceDate: occurrenceDate,
                          ...(plan.versions
                            ? { incomeVersionId: selectedVersion }
                            : {}),
                        });
                        open({ type: "transaction", id });
                      })
                    }
                  />
                  <DateField
                    label="Новая ожидаемая дата дохода"
                    value={expectedDate}
                    onChangeText={setExpectedDate}
                  />
                  <Button
                    label="Перенести поступление"
                    variant="secondary"
                    onPress={() => setConfirmation("move")}
                  />
                  <Button
                    label="Отменить это поступление"
                    variant="danger"
                    onPress={() => setConfirmation("cancel")}
                  />
                </>
              )}
              {confirmation && (
                <Card style={{ gap: 12 }}>
                  <Txt>
                    {confirmation === "move"
                      ? `Поступление ${dateLabel(occurrenceDate)} на ${money(selected.plan.amount, false, accountCurrency(state, selected.plan.accountId))} будет ожидаться ${dateLabel(expectedDate)}. Остальные события сохранят свои даты.`
                      : confirmation === "cancel"
                        ? `Только поступление ${dateLabel(occurrenceDate)} исчезнет из прогноза и опорных доходов. Баланс и другие повторения сохранятся.`
                        : `Поступление ${dateLabel(occurrenceDate)} вернётся в план с ожидаемой датой ${dateLabel(selected.date)}. Прошедшая дата не переносится автоматически.`}
                  </Txt>
                  <Button
                    label="Подтвердить изменение поступления"
                    onPress={() =>
                      run(() => {
                        if (confirmation === "move")
                          actions.moveIncomeOccurrence(
                            plan.id,
                            occurrenceDate,
                            expectedDate,
                            selectedVersion,
                          );
                        else
                          actions.setIncomeCancelled(
                            plan.id,
                            occurrenceDate,
                            confirmation === "cancel",
                            selectedVersion,
                          );
                        setConfirmation(null);
                        notify("Условия отдельного поступления обновлены");
                      })
                    }
                  />
                  <Button
                    label="Не изменять поступление"
                    variant="secondary"
                    onPress={() => setConfirmation(null)}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
