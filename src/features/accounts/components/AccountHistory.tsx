import { useState } from "react";
import { View } from "react-native";
import type { OpenSheet } from "../../../application/navigation/types";
import { dateLabel } from "../../../domain/finance";
import { transactionStatus } from "../../../domain/transactionStatus";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, C, font, Txt } from "../../../shared/ui";

export function AccountHistory({ id, open }: { id: string; open: OpenSheet }) {
  const { state } = useFinance();
  const { money } = useMoney();
  const [limit, setLimit] = useState(20);
  const transactions = state.transactions
    .filter((entry) => entry.accountId === id || entry.toAccountId === id)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <View style={{ gap: 10 }}>
      <Txt accessibilityRole="header" style={{ fontFamily: font.bold }}>
        История счёта · {transactions.length}
      </Txt>
      {!transactions.length && (
        <Txt style={{ color: C.muted }}>Операций пока нет.</Txt>
      )}
      {transactions.slice(0, limit).map((entry) => (
        <Button
          key={entry.id}
          variant="secondary"
          label={`${entry.title} · ${money(entry.amount, true, state.accounts.find((account) => account.id === entry.accountId)?.currency ?? "RUB")} · ${dateLabel(entry.date)}${transactionStatus(entry) === "pending" ? " · ожидается" : transactionStatus(entry) === "cancelled" ? " · отменена" : ""}`}
          onPress={() => open({ type: "transaction", id: entry.id })}
        />
      ))}
      {transactions.length > limit && (
        <Button
          label="Ещё операции счёта"
          variant="secondary"
          onPress={() => setLimit((value) => value + 20)}
        />
      )}
    </View>
  );
}
