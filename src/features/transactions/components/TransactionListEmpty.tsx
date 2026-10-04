import { View } from "react-native";
import type { TransactionPeriod } from "../../../domain/transactionList";
import { Button, Empty } from "../../../shared/ui";

export function TransactionListEmpty({
  hasHistory,
  hasFilters,
  period,
  onAdd,
  onReset,
  onAllHistory,
}: {
  hasHistory: boolean;
  hasFilters: boolean;
  period: TransactionPeriod;
  onAdd: () => void;
  onReset: () => void;
  onAllHistory: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Empty
        icon={hasHistory ? "search-outline" : "receipt-outline"}
        title={
          !hasHistory
            ? "Пока нет операций"
            : hasFilters
              ? "Ничего не найдено"
              : "В этом месяце нет операций"
        }
        description={
          !hasHistory
            ? "Добавьте первый расход, доход или перевод. Они появятся здесь."
            : hasFilters
              ? `${period === "all" ? "Во всей истории" : "В выбранном месяце"} нет записей с такими условиями. Измените поиск или сбросьте фильтры.`
              : "Посмотрите другие месяцы или откройте всю историю."
        }
        action={
          !hasHistory
            ? "Добавить операцию"
            : hasFilters
              ? "Сбросить условия поиска"
              : "Открыть всю историю"
        }
        onPress={!hasHistory ? onAdd : hasFilters ? onReset : onAllHistory}
      />
      {hasHistory && hasFilters && period === "month" && (
        <Button
          label="Искать во всей истории"
          variant="secondary"
          onPress={onAllHistory}
        />
      )}
    </View>
  );
}
