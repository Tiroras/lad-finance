import { ErrorText } from "./ErrorText";
import { useActionError } from "../hooks/useActionError";
import { useFinanceActions } from "../hooks/useFinanceActions";
import { View } from "react-native";
import { C, font, Txt, IconTile, Button, Notice } from "../ui";
import { useFinance } from "../store";
import { dateLabel, money, paymentForMonth } from "../domain/finance";
import type { OpenSheet, SheetState } from "../navigation/types";

export function PaymentContent({
  sheet,
  close,
  open,
}: {
  sheet: SheetState;
  close: () => void;
  open: OpenSheet;
}) {
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const date = sheet.date ?? today;
  const payment = paymentForMonth(
    state.recurring.find((p) => p.id === sheet.id)!,
    date,
  );
  const skipped = payment.skippedMonths?.includes(date.slice(0, 7));
  const recorded = state.transactions.find(
    (t) =>
      t.recurringId === payment.id &&
      t.occurrenceDate?.slice(0, 7) === date.slice(0, 7),
  );
  const candidates = state.transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        !t.recurringId &&
        t.amount === payment.amount &&
        t.accountId === payment.accountId &&
        t.date >= `${date.slice(0, 7)}-01` &&
        t.date <= today,
    )
    .slice(0, 8);
  return (
    <>
      <View style={{ alignItems: "center", gap: 16 }}>
        <IconTile name={payment.icon} background={payment.color} size={64} />
        <Txt style={{ fontSize: 21, fontFamily: font.bold }}>
          {payment.name}
        </Txt>
        <Txt style={{ fontSize: 37, fontFamily: font.semibold }}>
          {money(recorded?.amount ?? payment.amount)}
        </Txt>
        <Txt style={{ fontSize: 12, color: C.muted }}>
          По плану — {dateLabel(date)}
        </Txt>
      </View>
      <ErrorText error={error} />
      <Notice>
        {skipped && !recorded
          ? "Этот месяц пропущен: сумма не резервируется. Вы можете вернуть платёж в план."
          : recorded
            ? "Этот платёж уже записан в расходах и не резервируется повторно."
            : "Если вы уже оплатили, запишите расход. Баланс уменьшится, а соответствующий платёж будет отмечен выполненным."}
      </Notice>
      {recorded ? (
        <Button
          label="Открыть записанную операцию"
          onPress={() => open({ type: "transaction", id: recorded.id })}
        />
      ) : !skipped ? (
        <Button
          label="Я оплатил — записать расход"
          icon="checkmark"
          onPress={() =>
            run(() => {
              actions.payRecurring(payment.id, date);
              notify("Оплата записана");
              close();
            })
          }
        />
      ) : null}
      {!recorded && (
        <Button
          label={
            skipped ? "Вернуть этот месяц в план" : "Пропустить этот месяц"
          }
          variant="secondary"
          onPress={() =>
            run(() => {
              actions.setPaymentSkipped(payment.id, date, !skipped);
              notify(
                skipped ? "Платёж возвращён в план" : "Этот месяц пропущен",
              );
            })
          }
        />
      )}
      {!recorded && !skipped && candidates.length > 0 && (
        <>
          <Notice>
            Расход мог уже попасть в учёт из CSV или вручную. Свяжите подходящую
            запись с этим платежом, чтобы не списывать деньги повторно.
          </Notice>
          {candidates.map((transaction) => (
            <Button
              key={transaction.id}
              label={`Связать: ${transaction.title} · ${dateLabel(transaction.date)}`}
              variant="secondary"
              onPress={() =>
                run(() => {
                  actions.payRecurring(payment.id, date, transaction.id);
                  notify("Существующий расход связан с платежом");
                  close();
                })
              }
            />
          ))}
        </>
      )}
      <Button
        label="Изменить регулярный платёж"
        variant="secondary"
        onPress={() => open({ type: "recurring", id: payment.id })}
      />
    </>
  );
}
