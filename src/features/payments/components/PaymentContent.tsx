import { View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import { dateLabel, paymentForMonth } from "../../../domain/finance";
import { canLinkPayment, paymentOccurrenceKey } from "../../../domain/payments";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  useFinanceActions,
  useMoney,
  useFinance,
} from "../../../state/finance";
import type { OpenSheet, SheetOf } from "../../../application/navigation/types";
import {
  Button,
  C,
  font,
  IconTile,
  Notice,
  Txt,
  ErrorText,
} from "../../../shared/ui";

export function PaymentContent({
  sheet,
  close,
  open,
}: {
  sheet: SheetOf<"payment">;
  close: () => void;
  open: OpenSheet;
}) {
  const { money } = useMoney();
  const { state, notify, today } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const date = sheet.date;
  const template = state.recurring.find((payment) => payment.id === sheet.id);
  if (!template) return <Notice>Платёж уже удалён.</Notice>;
  const payment = paymentForMonth(template, date);
  const skipped = payment.schedule
    ? payment.skippedDates?.includes(date)
    : payment.skippedMonths?.includes(date.slice(0, 7));
  const recorded = state.transactions.find(
    (t) =>
      t.recurringId === payment.id &&
      t.occurrenceDate &&
      paymentOccurrenceKey(payment, t.occurrenceDate) ===
        paymentOccurrenceKey(payment, date),
  );
  const candidates = state.transactions
    .filter((transaction) => canLinkPayment(transaction, payment, date, today))
    .slice(0, 8);
  return (
    <>
      <View style={{ alignItems: "center", gap: 16 }}>
        <IconTile name={payment.icon} background={payment.color} size={64} />
        <Txt style={{ fontSize: 21, fontFamily: font.bold }}>
          {payment.name}
        </Txt>
        <Txt style={{ fontSize: 37, fontFamily: font.semibold }}>
          {money(
            recorded?.amount ?? payment.amount,
            false,
            accountCurrency(state, payment.accountId),
          )}
        </Txt>
        <Txt style={{ fontSize: 12, color: C.muted }}>
          По плану — {dateLabel(date)}
        </Txt>
      </View>
      <ErrorText error={error} />
      <Notice>
        {skipped && !recorded
          ? "Этот платёж пропущен: сумма не резервируется. Вы можете вернуть его в план."
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
            payment.schedule
              ? skipped
                ? "Вернуть этот платёж в план"
                : "Пропустить этот платёж"
              : skipped
                ? "Вернуть этот месяц в план"
                : "Пропустить этот месяц"
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
