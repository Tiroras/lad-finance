import {
  dateInMonth,
  dateLabel,
  daysBetween,
  money,
} from "../../domain/finance";
import { incomeReceived } from "../../domain/incomes";
import type { PlannedIncome } from "../../domain/types";
import { ErrorText } from "../../forms/ErrorText";
import { useActionError } from "../../hooks/useActionError";
import { useFinanceActions } from "../../hooks/useFinanceActions";
import type { OpenSheet } from "../../navigation/types";
import { useFinance } from "../../store";
import { Button, C, Notice, Txt } from "../../ui";

export function IncomeReceipt({
  plan,
  date,
  open,
}: {
  plan: PlannedIncome;
  date?: string;
  open: OpenSheet;
}) {
  const { state, today, notify } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const currentDate =
    plan.repeat === "once"
      ? plan.date
      : dateInMonth(today, Number(plan.date.slice(-2)));
  const occurrenceDate =
    date ?? (currentDate < plan.date ? plan.date : currentDate);
  const recorded = incomeReceived(state, plan, occurrenceDate, today);
  const candidates = state.transactions
    .filter(
      (t) =>
        t.type === "income" &&
        !t.plannedIncomeId &&
        t.accountId === plan.accountId &&
        t.amount === plan.amount &&
        t.date <= today,
    )
    .sort(
      (a, b) =>
        Math.abs(daysBetween(a.date, occurrenceDate)) -
        Math.abs(daysBetween(b.date, occurrenceDate)),
    )
    .slice(0, 8);
  const receive = (transactionId?: string) =>
    run(() => {
      actions.receivePlannedIncome(plan.id, occurrenceDate, transactionId);
      notify(transactionId ? "Поступление связано с планом" : "Доход записан");
    });
  return (
    <>
      <Txt style={{ fontSize: 12, color: C.muted }}>
        Поступление по сохранённому плану · {dateLabel(occurrenceDate)} ·{" "}
        {money(plan.amount)}
      </Txt>
      <ErrorText error={error} />
      {recorded ? (
        <>
          <Notice>
            Поступление уже в истории операций. В прогнозе оно повторно не
            учитывается.
          </Notice>
          <Button
            label="Открыть полученный доход"
            variant="secondary"
            onPress={() => open({ type: "transaction", id: recorded.id })}
          />
        </>
      ) : (
        <>
          <Notice>
            Отмечайте получение, когда деньги действительно пришли. В историю
            добавится доход сегодняшним числом на сумму сохранённого плана.
          </Notice>
          {candidates.length > 0 && (
            <>
              <Notice>
                В истории есть похожие доходы. Свяжите подходящий с планом,
                чтобы не зачислять деньги повторно.
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
        </>
      )}
    </>
  );
}
