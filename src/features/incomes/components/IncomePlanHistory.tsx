import { useState } from "react";
import { View } from "react-native";
import type { PlannedIncome } from "../../../domain/types";
import { incomeOccurrences, incomeVersions } from "../../../domain/incomes";
import { dateLabel, shiftDate } from "../../../shared/lib/dates";
import { accountCurrency } from "../../../domain/currency";
import { scheduleLabel } from "../../../domain/recurrence";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";
import { useActionError } from "../../../shared/lib/useActionError";
import { Button, Card, ErrorText, Notice, Txt, font } from "../../../shared/ui";

export function IncomePlanHistory({ plan }: { plan: PlannedIncome }) {
  const { state, today, notify } = useFinance();
  const { money } = useMoney();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const [confirm, setConfirm] = useState(false);
  const versions = incomeVersions(plan);
  const next = incomeOccurrences(
    state,
    shiftDate(today, 1),
    shiftDate(today, 91),
    today,
  ).filter(
    (entry) => entry.plan.id === plan.id && entry.occurrenceDate > today,
  );
  return (
    <View style={{ gap: 12 }}>
      <Txt style={{ fontFamily: font.bold }}>История условий дохода</Txt>
      {versions.map((version) => (
        <Card key={version.id} style={{ gap: 6 }}>
          {version.voided && <Notice>Отменены до начала действия</Notice>}
          <Txt>
            {version.voided ? "Планировались с " : "С "}
            {dateLabel(version.effectiveFrom, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {version.voided
              ? ""
              : version.effectiveTo
                ? ` до ${dateLabel(shiftDate(version.effectiveTo, -1), { day: "numeric", month: "long", year: "numeric" })}`
                : " · без даты окончания"}
          </Txt>
          <Txt>
            {money(
              version.amount,
              false,
              accountCurrency(state, version.accountId),
            )}{" "}
            ·{" "}
            {
              state.accounts.find((account) => account.id === version.accountId)
                ?.name
            }
          </Txt>
          <Txt>
            {version.schedule
              ? scheduleLabel(version.schedule)
              : version.repeat === "once"
                ? `Один раз ${dateLabel(version.date)}`
                : `${Number(version.date.slice(-2))}-го каждый месяц`}
          </Txt>
        </Card>
      ))}
      {(plan.paused ||
        versions.some(
          (version) => !version.voided && version.repeat !== "once",
        )) && (
        <>
          <Notice>
            {plan.paused
              ? "Повторения приостановлены. Уже возникшие поступления остаются отдельными событиями; при возобновлении пропущенный промежуток не заполняется."
              : "Приостановка прекращает будущие повторения с завтрашнего дня. Уже возникшие поступления сохраняются; отмените ненужное событие отдельно."}
          </Notice>
          {!confirm ? (
            <Button
              label={
                plan.paused
                  ? "Возобновить доход с прежними условиями"
                  : "Приостановить повторения дохода"
              }
              variant="secondary"
              onPress={() => setConfirm(true)}
            />
          ) : (
            <Card style={{ gap: 10 }}>
              <Txt>
                {plan.paused
                  ? `Возобновить прежний график с ${dateLabel(today)}. Даты паузы не будут добавлены. Если пауза ещё не началась, её отмена сохранит нынешнюю версию.`
                  : `Прекратить генерацию с ${dateLabel(shiftDate(today, 1))}. Ближайшие ещё не полученные поступления за 90 дней: ${
                      next
                        .slice(0, 12)
                        .map((entry) => dateLabel(entry.occurrenceDate))
                        .join(", ") || "нет"
                    }${next.length > 12 ? ` и ещё ${next.length - 12}` : ""}. Перенесённые, отменённые и связанные события проверяются при подтверждении.`}
              </Txt>
              <Button
                label="Подтвердить режим повторений дохода"
                onPress={() =>
                  run(() => {
                    actions.setIncomePaused(plan.id, !plan.paused);
                    setConfirm(false);
                    notify(
                      plan.paused
                        ? "Повторения дохода возобновлены"
                        : "Повторения дохода приостановлены",
                    );
                  })
                }
              />
              <Button
                label="Не менять повторения дохода"
                variant="secondary"
                onPress={() => setConfirm(false)}
              />
            </Card>
          )}
          <ErrorText error={error} />
        </>
      )}
    </View>
  );
}
