import { accountToBase } from "../../../domain/currency";
import { PaymentAgenda } from "./PaymentAgenda";
import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { Empty, Notice, Section } from "../../../shared/ui";
import { RecurringPaymentCard } from "./RecurringPaymentCard";
import { SubscriptionSummary } from "./SubscriptionSummary";

export function PaymentsPanel({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const monthly = state.recurring
    .filter((p) => p.active && p.kind === "subscription")
    .reduce((sum, p) => sum + accountToBase(state, p.amount, p.accountId), 0);
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
