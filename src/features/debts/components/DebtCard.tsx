import { useState } from "react";
import { View } from "react-native";
import type { OpenSheet } from "../../../application/navigation/types";
import { debtBalance, type Debt } from "../../../domain/debts";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, C, Card, font, Txt } from "../../../shared/ui";

export function DebtCard({ debt, open }: { debt: Debt; open: OpenSheet }) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const [historyVisible, setHistoryVisible] = useState(false);
  const balance = debtBalance(state, debt, today);
  const operations = state.transactions
    .filter((transaction) => transaction.debtId === debt.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={{ color: C.muted, fontSize: 12 }}>
        {debt.direction === "borrowed" ? "Я должен" : "Мне должны"}
        {balance === 0 ? " · Закрыт" : ""}
      </Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>{debt.name}</Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 22 }}>
        {money(balance, false, debt.currency)}
      </Txt>
      <Txt
        style={{
          color:
            debt.dueDate && debt.dueDate < today && balance > 0
              ? C.orange
              : C.muted,
          fontSize: 12,
        }}
      >
        {debt.dueDate
          ? `${debt.dueDate < today && balance > 0 ? "Срок прошёл" : "Вернуть до"}: ${dateLabel(debt.dueDate, { day: "numeric", month: "long", year: "numeric" })}`
          : "Срок возврата не задан"}
      </Txt>
      {debt.note && (
        <Txt style={{ color: C.muted, fontSize: 12 }}>{debt.note}</Txt>
      )}
      {balance > 0 && (
        <Button
          label={`${debt.direction === "borrowed" ? "Вернуть долг" : "Получить возврат"}: ${debt.name}`}
          onPress={() => open({ type: "repayDebt", id: debt.id })}
        />
      )}
      <Button
        variant="secondary"
        label={`Изменить долг: ${debt.name}`}
        onPress={() => open({ type: "debt", id: debt.id })}
      />
      {operations.length > 0 && (
        <Button
          variant="secondary"
          label={`${historyVisible ? "Скрыть" : "Показать"} движения: ${debt.name}`}
          onPress={() => setHistoryVisible(!historyVisible)}
        />
      )}
      {historyVisible && (
        <View style={{ gap: 8 }}>
          {operations.map((transaction) => (
            <Button
              key={transaction.id}
              variant="secondary"
              label={`${dateLabel(transaction.date)} · ${transaction.debtAction === "issue" ? "Выдача" : "Возврат"} ${money(transaction.amount, false, debt.currency)}`}
              onPress={() => open({ type: "transaction", id: transaction.id })}
            />
          ))}
        </View>
      )}
    </Card>
  );
}
