import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  selectTransactionList,
  type TransactionFilterType,
} from "../../domain/transactionList";
import { monthKey } from "../../domain/finance";
import type { Transaction } from "../../domain/types";
import type { OpenSheet } from "../../application/navigation/types";
import { useFinance } from "../../state/finance";
import {
  Button,
  C,
  IconButton,
  Row,
  Txt,
  MonthPicker,
  ScreenHeading,
} from "../../shared/ui";
import {
  TransactionFilters,
  TransactionGroups,
  TransactionTotals,
} from "../../features/transactions";

export function TransactionsScreen({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const [month, setMonth] = useState(monthKey(today));
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TransactionFilterType>("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(60);
  const {
    transactions: filtered,
    income,
    expense,
  } = useMemo(
    () =>
      selectTransactionList(
        state,
        { month, type, query, account, category },
        today,
      ),
    [state, today, month, type, query, account, category],
  );
  const groups = useMemo(() => {
    const byDate = new Map<string, Transaction[]>();
    for (const transaction of filtered.slice(0, limit)) {
      const group = byDate.get(transaction.date);
      if (group) group.push(transaction);
      else byDate.set(transaction.date, [transaction]);
    }
    return byDate;
  }, [filtered, limit]);
  return (
    <View testID="screen-transactions" style={{ gap: 22 }}>
      <ScreenHeading
        eyebrow="НИЧЕГО НЕ ТЕРЯЕТСЯ"
        title="Ваши операции"
        subtitle="Каждая мелочь складывается в общую картину."
      />
      <Row style={{ justifyContent: "space-between" }}>
        <MonthPicker
          month={month}
          onChange={(value) => {
            setMonth(value);
            setLimit(60);
          }}
        />
        <IconButton
          name="add"
          label="Добавить операцию"
          onPress={() => open({ type: "transaction" })}
          style={{ backgroundColor: C.green }}
          color="#fff"
        />
      </Row>
      <TransactionFilters
        query={query}
        setQuery={setQuery}
        type={type}
        setType={setType}
        account={account}
        setAccount={setAccount}
        category={category}
        setCategory={setCategory}
      />
      <Button
        tourId="transactions.export"
        label="Экспортировать операции в CSV"
        icon="download-outline"
        variant="secondary"
        onPress={() => open({ type: "export" })}
      />
      <TransactionTotals income={income} expense={expense} />
      <Txt style={{ color: C.muted, fontSize: 11 }}>
        По выбранным фильтрам · операций: {filtered.length}. Возвраты уменьшают
        расходы; переводы и основная сумма долгов исключены из итогов.
        {category !== "all"
          ? " В расходах показана только часть выбранной категории."
          : ""}
      </Txt>
      <TransactionGroups groups={groups} open={open} />
      {filtered.length > limit && (
        <Button
          variant="secondary"
          label="Показать ещё"
          onPress={() => setLimit((n) => n + 60)}
        />
      )}
    </View>
  );
}
