import { useMemo, useState } from "react";
import { View } from "react-native";
import { categoryMatches } from "../../domain/categories";
import { transactionValue } from "../../domain/currency";
import { monthKey } from "../../domain/finance";
import type { Transaction } from "../../domain/types";
import type { OpenSheet } from "../../navigation/types";
import { useFinance } from "../../store";
import { Button, C, IconButton, Row, Txt } from "../../ui";
import { MonthPicker } from "../shared/MonthPicker";
import { ScreenHeading } from "../shared/ScreenHeading";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionGroups } from "./TransactionGroups";
import { TransactionTotals } from "./TransactionTotals";

export function TransactionsScreen({ open }: { open: OpenSheet }) {
  const { state } = useFinance();
  const [month, setMonth] = useState(monthKey());
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(60);
  const filtered = useMemo(
    () =>
      state.transactions
        .filter(
          (t) =>
            monthKey(t.date) === month &&
            (type === "all" || t.type === type) &&
            (account === "all" ||
              t.accountId === account ||
              t.toAccountId === account) &&
            (category === "all" ||
              categoryMatches(state, t.category, category)) &&
            `${t.title} ${t.note ?? ""}`
              .toLocaleLowerCase("ru-RU")
              .includes(query.trim().toLocaleLowerCase("ru-RU")),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state, month, type, query, account, category],
  );
  const income = filtered
      .filter((t) => t.type === "income")
      .reduce((n, t) => n + transactionValue(state, t), 0),
    expense = filtered
      .filter((t) => t.type === "expense")
      .reduce((n, t) => n + transactionValue(state, t), 0);
  const groups = new Map<string, Transaction[]>();
  filtered
    .slice(0, limit)
    .forEach((t) => groups.set(t.date, [...(groups.get(t.date) ?? []), t]));
  return (
    <View style={{ gap: 22 }}>
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
        label="Экспортировать операции в CSV"
        icon="download-outline"
        variant="secondary"
        onPress={() => open({ type: "export" })}
      />
      <TransactionTotals income={income} expense={expense} />
      <Txt style={{ color: C.muted, fontSize: 11 }}>
        По выбранным фильтрам · операций: {filtered.length}
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
