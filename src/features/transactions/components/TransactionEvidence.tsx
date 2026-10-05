import { useState } from "react";
import { Pressable, View } from "react-native";
import { dateLabel } from "../../../shared/lib/dates";
import { useMoney } from "../../../state/finance";
import { Button, C, font, interactionStyles, Txt } from "../../../shared/ui";

interface EvidenceTransaction {
  transactionId: string;
  title: string;
  date: string;
  amount: number;
  totalAmount?: number;
  refund?: boolean;
}

const PAGE_SIZE = 5;

export function TransactionEvidence({
  transactions,
  onOpen,
  contributionLabel,
  precise = false,
  incremental = false,
}: {
  transactions: EvidenceTransaction[];
  onOpen: (id: string) => void;
  contributionLabel?: string;
  precise?: boolean;
  incremental?: boolean;
}) {
  const { money } = useMoney();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const remaining = transactions.length - visibleCount;
  return (
    <View style={{ gap: 8 }}>
      {transactions.length === 0 && (
        <Txt style={{ color: C.muted, fontSize: 12 }}>
          Нет расходов за этот период.
        </Txt>
      )}
      {transactions.slice(0, visibleCount).map((transaction) => {
        const amount = money(transaction.amount, precise);
        const detail =
          contributionLabel &&
          transaction.totalAmount !== undefined &&
          Math.abs(transaction.amount) !== transaction.totalAmount
            ? `${amount} ${contributionLabel} из ${transaction.refund ? "возврата" : "покупки"} ${money(transaction.totalAmount, precise)}`
            : amount;
        return (
          <Pressable
            key={transaction.transactionId}
            accessibilityRole="button"
            accessibilityLabel={`Открыть операцию ${transaction.title}, ${dateLabel(transaction.date)}, ${detail}`}
            onPress={() => onOpen(transaction.transactionId)}
            style={({ pressed }) => [
              {
                borderRadius: 10,
                padding: 12,
                minHeight: 44,
                backgroundColor: C.soft,
                gap: 4,
              },
              pressed && interactionStyles.pressed,
            ]}
          >
            <Txt style={{ fontFamily: font.semibold, fontSize: 13 }}>
              {transaction.title}
            </Txt>
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              {dateLabel(transaction.date)} · {detail}
            </Txt>
          </Pressable>
        );
      })}
      {remaining > 0 && (
        <Button
          variant="secondary"
          label={
            incremental
              ? `Показать ещё ${Math.min(PAGE_SIZE, remaining)}`
              : `Все операции: ${transactions.length}`
          }
          onPress={() =>
            setVisibleCount(
              incremental ? visibleCount + PAGE_SIZE : transactions.length,
            )
          }
        />
      )}
      {visibleCount > PAGE_SIZE && transactions.length > PAGE_SIZE && (
        <Button
          variant="secondary"
          label="Свернуть операции"
          onPress={() => setVisibleCount(PAGE_SIZE)}
        />
      )}
    </View>
  );
}
