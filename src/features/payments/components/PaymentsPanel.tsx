import { accountToBase } from "../../../domain/currency";
import { PaymentAgenda } from "./PaymentAgenda";
import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { Empty, Notice, Section } from "../../../shared/ui";
import { RecurringPaymentCard } from "./RecurringPaymentCard";
import { SubscriptionSummary } from "./SubscriptionSummary";
import { shiftDate } from "../../../shared/lib/dates";
import { upcoming } from "../../../domain/payments";

export function PaymentsPanel({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const subscriptions = upcoming(state, today, shiftDate(today, 365)).filter(
    (o) => o.payment.kind === "subscription" && !o.paid && !o.skipped,
  );
  const sum = (days: number) =>
    subscriptions
      .filter((o) => o.date < shiftDate(today, days))
      .reduce(
        (total, { payment }) =>
          total + accountToBase(state, payment.amount, payment.accountId),
        0,
      );
  return (
    <>
      <PaymentAgenda open={open} />
      <SubscriptionSummary monthly={sum(30)} yearly={sum(365)} />
      <Section
        title="Регулярные платежи"
        action="Добавить"
        onPress={() => open({ type: "recurring" })}
      />
      <Notice>
        Остановка прекращает новые обязательства с завтрашнего дня. Уже
        возникшие платежи сохраняются до оплаты или отдельного пропуска.
        Возобновление действует с сегодняшнего дня и не заполняет паузу.
        Отменить реальную подписку нужно в самом сервисе.
      </Notice>
      {state.recurring.length ? (
        state.recurring.map((p) => (
          <RecurringPaymentCard key={p.id} payment={p} open={open} />
        ))
      ) : (
        <Empty
          icon="calendar-outline"
          title="Без неожиданных платежей"
          description="Добавьте аренду, интернет или подписку. Лад учтёт их при расчёте доступных денег."
          action="Добавить платёж"
          onPress={() => open({ type: "recurring" })}
        />
      )}
    </>
  );
}
