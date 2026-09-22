import { useState } from "react";
import { Pressable, View } from "react-native";
import { dateLabel } from "../../../shared/lib/dates";
import type { InsightTransaction } from "../../../domain/insights";
import { useMoney } from "../../../state/finance";
import { Button, C, font, Txt } from "../../../shared/ui";

export function TransactionEvidence({
  transactions,
  onOpen,
}: {
  transactions: InsightTransaction[];
  onOpen: (id: string) => void;
}) {
  const { money } = useMoney();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {transactions.length === 0 && (
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          Нет расходов за этот период.
        </Txt>
      )}
      {(expanded ? transactions : transactions.slice(0, 5)).map(
        (transaction) => (
          <Pressable
            key={transaction.transactionId}
            accessibilityRole="button"
            accessibilityLabel={`Открыть операцию ${transaction.title}, ${dateLabel(transaction.date)}, ${money(transaction.amount)}`}
            onPress={() => onOpen(transaction.transactionId)}
            style={{
              borderRadius: 10,
              padding: 12,
              minHeight: 44,
              backgroundColor: C.soft,
              gap: 4,
            }}
          >
            <Txt style={{ fontFamily: font.semibold, fontSize: 13 }}>
              {transaction.title}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              {dateLabel(transaction.date)} · {money(transaction.amount)}
            </Txt>
          </Pressable>
        ),
      )}
      {transactions.length > 5 && (
        <Button
          variant="secondary"
          label={
            expanded
              ? "Свернуть операции"
              : `Все операции: ${transactions.length}`
          }
          onPress={() => setExpanded(!expanded)}
        />
      )}
    </View>
  );
}
