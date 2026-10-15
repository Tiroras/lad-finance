import { Pressable, StyleSheet, View } from "react-native";
import { categoryLabel } from "../../../domain/categories";
import { accountCurrency, receivedAmount } from "../../../domain/currency";
import { dateLabel } from "../../../domain/finance";
import type { Transaction } from "../../../domain/types";
import { transactionStatus } from "../../../domain/transactionStatus";
import { useMoney, useFinance } from "../../../state/finance";
import { C, font, IconTile, interactionStyles, Txt } from "../../../shared/ui";

export function TransactionRow({
  transaction,
  onPress,
  last = false,
}: {
  transaction: Transaction;
  onPress: () => void;
  last?: boolean;
}) {
  const { money } = useMoney();
  const { state } = useFinance();
  const category = state.categories.find((c) => c.id === transaction.category)!;
  const income = transaction.type === "income",
    transfer = transaction.type === "transfer";
  const refund = !!transaction.refundOf;
  const status = transactionStatus(transaction);
  const account = state.accounts.find((a) => a.id === transaction.accountId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.title}, ${money(transaction.amount, true, accountCurrency(state, transaction.accountId))}${status === "pending" ? ", ожидается" : status === "cancelled" ? ", отменена" : ""}, открыть операцию`}
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
        {status !== "posted" && (
          <Txt
            style={{
              color: status === "pending" ? C.orange : C.muted,
              fontSize: 11,
            }}
          >
            {status === "cancelled"
              ? "Отменена · без движения денег"
              : transaction.expectedDate
                ? `Ожидается ${dateLabel(transaction.expectedDate, { day: "numeric", month: "short" })}`
                : "Ожидается · дата не указана"}
          </Txt>
        )}
        <Txt numberOfLines={1} style={{ color: C.muted, fontSize: 10 }}>
          {refund
            ? "Возврат покупки"
            : income
              ? "Доход"
              : transfer
                ? "Перевод"
                : transaction.splits
                  ? `Покупка · ${transaction.splits.length} категории`
                  : categoryLabel(state, category.id)}{" "}
          · {account?.name}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Txt
          style={{
            fontFamily: font.bold,
            fontSize: 13,
            color: status !== "posted" ? C.muted : income ? "#538466" : C.ink,
          }}
        >
          {income ? "+" : transfer ? "" : "−"}
          {money(
            transaction.amount,
            true,
            accountCurrency(state, transaction.accountId),
          )}
        </Txt>
        {transfer &&
          accountCurrency(state, transaction.accountId) !==
            accountCurrency(state, transaction.toAccountId) && (
            <Txt style={{ color: C.muted, fontSize: 10 }}>
              →{" "}
              {money(
                receivedAmount(transaction),
                true,
                accountCurrency(state, transaction.toAccountId),
              )}
            </Txt>
          )}
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
