import { View, Pressable, StyleSheet } from "react-native";
import { useFinance } from "../../store";
import { C, font, Txt, IconTile, interactionStyles } from "../../ui";
import { dateLabel, money } from "../../domain/finance";
import type { Transaction } from "../../domain/types";

export function TransactionRow({
  transaction,
  onPress,
  last = false,
}: {
  transaction: Transaction;
  onPress: () => void;
  last?: boolean;
}) {
  const { state } = useFinance();
  const category = state.categories.find((c) => c.id === transaction.category)!;
  const income = transaction.type === "income",
    transfer = transaction.type === "transfer";
  const account = state.accounts.find((a) => a.id === transaction.accountId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.title}, ${money(transaction.amount)}, открыть операцию`}
      onPress={onPress}
      style={({ pressed }) => [
        st.transaction,
        !last && { borderBottomWidth: 1, borderBottomColor: "#F0F2EC" },
        pressed && interactionStyles.pressed,
      ]}
    >
      <IconTile
        name={
          income
            ? "arrow-down-outline"
            : transfer
              ? "swap-horizontal-outline"
              : category.icon
        }
        color={income ? C.green : transfer ? "#8984AD" : category.color}
        background={
          income ? C.soft : transfer ? C.lavender : category.background
        }
      />
      <View style={{ flex: 1, gap: 5 }}>
        <Txt
          numberOfLines={1}
          style={{ fontFamily: font.semibold, fontSize: 13 }}
        >
          {transaction.title}
        </Txt>
        <Txt numberOfLines={1} style={{ color: C.muted, fontSize: 10 }}>
          {income ? "Доход" : transfer ? "Перевод" : category.name} ·{" "}
          {account?.name}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Txt
          style={{
            fontFamily: font.bold,
            fontSize: 13,
            color: income ? "#538466" : C.ink,
          }}
        >
          {income ? "+" : transfer ? "" : "−"}
          {money(transaction.amount, transaction.amount % 100 !== 0)}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 10 }}>
          {dateLabel(transaction.date, { day: "numeric", month: "short" })}
        </Txt>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  transaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 15,
  },
});
