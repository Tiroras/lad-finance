import { PaymentAgenda } from "../../features/payments/PaymentAgenda";
import { useFinance } from "../../store";
import { Section, Empty, Notice } from "../../ui";
import type { OpenSheet } from "../../navigation/types";
import { SubscriptionSummary } from "./SubscriptionSummary";
import { RecurringPaymentCard } from "./RecurringPaymentCard";

export function PaymentsPanel({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const monthly = state.recurring
    .filter((p) => p.active && p.kind === "subscription")
    .reduce((sum, p) => sum + p.amount, 0);
  return (
    <>
      <SubscriptionSummary monthly={monthly} />
      <Section
        title="Регулярные платежи"
        action="Добавить"
        onPress={() => open({ type: "recurring" })}
      />
      <Notice>
        Выключите платёж, чтобы оценить экономию в плане. Отменить реальную
        подписку нужно в самом сервисе. Повторное включение начинает учёт с
        сегодняшнего дня.
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
      <PaymentAgenda open={open} />
    </>
  );
}
