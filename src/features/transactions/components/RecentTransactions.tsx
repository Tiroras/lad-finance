import { View } from "react-native";
import { useFinance } from "../../../state/finance";
import { Card, Section, Empty } from "../../../shared/ui";
import type {
  OpenSheet,
  Navigate,
} from "../../../application/navigation/types";
import { TransactionRow } from "./TransactionRow";

export function RecentTransactions({
  open,
  navigate,
}: {
  open: OpenSheet;
  navigate: Navigate;
}) {
  const { state } = useFinance();
  const latest = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  return (
    <View>
      <Section
        title="Последние операции"
        action="Все"
        onPress={() => navigate("transactions")}
      />
      <Card style={{ paddingVertical: 1, paddingHorizontal: 16 }}>
        {latest.length ? (
          latest.map((t, i) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              onPress={() => open({ type: "transaction", id: t.id })}
              last={i === latest.length - 1}
            />
          ))
        ) : (
          <Empty
            title="Пока без операций"
            description="Запишите расход или доход с помощью кнопки +."
          />
        )}
      </Card>
    </View>
  );
}
