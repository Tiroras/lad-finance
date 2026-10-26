import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { Empty, Notice, RecordList, Section } from "../../../shared/ui";
import { RecurringPaymentCard } from "./RecurringPaymentCard";

export function RecurringPaymentsList({
  open,
  full = false,
}: {
  open: OpenSheet;
  full?: boolean;
}) {
  const { state } = useFinance();
  return (
    <>
      <Section
        title="Регулярные платежи"
        action="Добавить"
        onPress={() => open({ type: "recurring" })}
      />
      <Notice>
        Остановка прекращает новые обязательства с завтрашнего дня. Уже
        возникшие платежи сохраняются до оплаты или отдельного пропуска.
        Возобновление действует с сегодняшнего дня и не заполняет паузу.
        Реальные списания нужно отменять у поставщика.
      </Notice>
      {state.recurring.length ? (
        <RecordList
          items={state.recurring}
          full={full}
          keyExtractor={(payment) => payment.id}
          renderItem={(payment) => (
            <RecurringPaymentCard payment={payment} open={open} />
          )}
          showAllLabel="Все регулярные платежи"
          onShowAll={() => open({ type: "list", list: "recurring" })}
          testID="recurring-list"
        />
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
