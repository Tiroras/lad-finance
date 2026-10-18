import { useState } from "react";
import { View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import { dateLabel, uid } from "../../../domain/finance";
import {
  canLinkPayment,
  paymentOccurrenceKey,
  paymentPending,
  resolvePaymentOccurrence,
} from "../../../domain/payments";
import { isPosted } from "../../../domain/transactionStatus";
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
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const date = sheet.date;
  const template = state.recurring.find((payment) => payment.id === sheet.id);
  if (!template) return <Notice>Платёж уже удалён.</Notice>;
  const occurrence = resolvePaymentOccurrence(template, date, sheet.versionId);
  if (!occurrence)
    return (
      <Notice>
        Условия этого обязательства изменились. Откройте актуальную запись в
        календаре платежей.
      </Notice>
    );
  const { payment, versionId } = occurrence;
  const skipped = payment.schedule
    ? payment.skippedDates?.includes(date)
    : payment.skippedMonths?.includes(date.slice(0, 7));
  const recorded = state.transactions.find(
    (t) =>
      isPosted(t) &&
      t.recurringId === payment.id &&
      t.occurrenceDate &&
      paymentOccurrenceKey(template, t.occurrenceDate, t.recurringVersionId) ===
        paymentOccurrenceKey(template, date, versionId),
  );
  const pending = paymentPending(state, template, date, versionId);
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
          : pending
            ? "Списание ожидает проведения: фактический остаток не изменён, сумма удержана. План и ожидание учитываются один раз."
            : recorded
              ? "Этот платёж уже записан в расходах и не резервируется повторно."
              : "Если вы уже оплатили, запишите расход. Баланс уменьшится, а соответствующий платёж будет отмечен выполненным."}
      </Notice>
      {recorded ? (
        <Button
          label="Открыть записанную операцию"
          onPress={() => open({ type: "transaction", id: recorded.id })}
        />
      ) : pending ? (
        <Button
          label="Открыть ожидаемое списание"
          onPress={() => open({ type: "transaction", id: pending.id })}
        />
      ) : !skipped ? (
        <Button
          label="Я оплатил — записать расход"
          icon="checkmark"
          onPress={() =>
            run(() => {
              actions.payRecurring(payment.id, date, undefined, versionId);
              notify("Оплата записана");
              close();
            })
          }
        />
      ) : null}
      {!recorded && !pending && !skipped && (
        <Button
          label="Ожидать списание по плану"
          variant="secondary"
          onPress={() =>
            run(() => {
              const id = uid();
              actions.saveTransaction({
                createId: id,
                type: "expense",
                status: "pending",
                title: payment.name,
                amount: payment.amount,
                date: today,
                expectedDate: date,
                accountId: payment.accountId,
                category: payment.category,
                recurringId: payment.id,
                occurrenceDate: date,
                recurringVersionId:
                  versionId === "legacy" ? undefined : versionId,
              });
              open({ type: "transaction", id });
            })
          }
        />
      )}
      {!recorded && !pending && (
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
            skipped ? setConfirmRestore(true) : setConfirmSkip(true)
          }
        />
      )}
      {confirmRestore && skipped && !recorded && !pending && (
        <>
          <Notice tone="warning">
            Вернуть обязательство за {dateLabel(date)}? Его сумма снова будет
            учтена в прогнозе и доступных деньгах. Для архивного счёта сначала
            потребуется восстановление.
          </Notice>
          <Button
            label="Подтвердить возврат обязательства"
            onPress={() =>
              run(() => {
                actions.setPaymentSkipped(payment.id, date, false, versionId);
                setConfirmRestore(false);
                notify("Платёж возвращён в план");
              })
            }
          />
          <Button
            label="Оставить пропущенным"
            variant="secondary"
            onPress={() => setConfirmRestore(false)}
          />
        </>
      )}
      {confirmSkip && !recorded && !pending && !skipped && (
        <>
          <Notice tone="warning">
            Исключить обязательство за {dateLabel(date)}? Оно перестанет
            уменьшать доступные деньги и участвовать в прогнозе. Записанного
            расхода это действие не создаёт.
          </Notice>
          <Button
            label="Подтвердить пропуск обязательства"
            variant="danger"
            onPress={() =>
              run(() => {
                actions.setPaymentSkipped(payment.id, date, true, versionId);
                setConfirmSkip(false);
                notify("Обязательство исключено из расчёта");
              })
            }
          />
          <Button
            label="Оставить обязательство"
            variant="secondary"
            onPress={() => setConfirmSkip(false)}
          />
        </>
      )}
      {!recorded && !pending && !skipped && candidates.length > 0 && (
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
                  actions.payRecurring(
                    payment.id,
                    date,
                    transaction.id,
                    versionId,
                  );
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
