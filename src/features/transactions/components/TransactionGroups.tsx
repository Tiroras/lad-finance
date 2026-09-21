import { View } from "react-native";
import { C, font, Txt, Card, Empty } from "../../../shared/ui";
import { dateLabel, localDate, shiftDate } from "../../../domain/finance";
import type { Transaction } from "../../../domain/types";
import type { OpenSheet } from "../../../application/navigation/types";
import { TransactionRow } from "./TransactionRow";

export function TransactionGroups({
  groups,
  open,
}: {
  groups: Map<string, Transaction[]>;
  open: OpenSheet;
}) {
  return (
    <>
      {groups.size ? (
        [...groups].map(([date, transactions]) => (
          <View key={date}>
            <Txt
              style={{
                fontSize: 12,
                color: C.muted,
                fontFamily: font.semibold,
                marginBottom: 12,
              }}
            >
              {date === localDate()
                ? "Сегодня"
                : date === shiftDate(localDate(), -1)
                  ? "Вчера"
                  : dateLabel(date)}
            </Txt>
            <Card style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
              {transactions.map((t, i) => (
                <TransactionRow
                  transaction={t}
                  key={t.id}
                  onPress={() => open({ type: "transaction", id: t.id })}
                  last={i === transactions.length - 1}
                />
              ))}
            </Card>
          </View>
        ))
      ) : (
        <Empty
          icon="search-outline"
          title="Здесь пока тихо"
          description="Попробуйте другой месяц или фильтр. Новые операции появятся здесь."
          action="Добавить операцию"
          onPress={() => open({ type: "transaction" })}
        />
      )}
    </>
  );
}
