import { View } from "react-native";
import { C, font, Txt, Card } from "../../../shared/ui";
import { dateLabel, shiftDate } from "../../../domain/finance";
import type { Transaction } from "../../../domain/types";
import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { TransactionRow } from "./TransactionRow";

export function TransactionGroups({
  groups,
  open,
}: {
  groups: Map<string, Transaction[]>;
  open: OpenSheet;
}) {
  const { today } = useFinance();
  return (
    <>
      {[...groups].map(([date, transactions]) => (
        <View key={date}>
          <Txt
            style={{
              fontSize: 12,
              color: C.muted,
              fontFamily: font.semibold,
              marginBottom: 12,
            }}
          >
            {date === today
              ? "Сегодня"
              : date === shiftDate(today, -1)
                ? "Вчера"
                : dateLabel(date, {
                    day: "numeric",
                    month: "long",
                    year:
                      date.slice(0, 4) !== today.slice(0, 4)
                        ? "numeric"
                        : undefined,
                  })}
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
      ))}
    </>
  );
}
