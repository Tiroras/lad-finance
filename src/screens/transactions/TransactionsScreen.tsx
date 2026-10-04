import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  selectTransactionList,
  type TransactionFilterType,
  type TransactionPeriod,
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
  Segments,
  Txt,
  MonthPicker,
  ScreenHeading,
} from "../../shared/ui";
import {
  TransactionFilters,
  TransactionGroups,
  TransactionTotals,
  TransactionListDetails,
  TransactionListEmpty,
} from "../../features/transactions";

export function TransactionsScreen({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const [month, setMonth] = useState(monthKey(today));
  const [period, setPeriod] = useState<TransactionPeriod>("month");
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
        { month, period, type, query, account, category },
        today,
      ),
    [state, today, month, period, type, query, account, category],
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
  const hasFilters =
    !!query.trim() || type !== "all" || account !== "all" || category !== "all";
  const hasHistory = state.transactions.some(
    (transaction) => transaction.date <= today,
  );
  const resetFilters = () => {
    setQuery("");
    setType("all");
    setAccount("all");
    setCategory("all");
    setLimit(60);
  };
  const changePeriod = (value: TransactionPeriod) => {
    setPeriod(value);
    setLimit(60);
  };
  return (
    <View testID="screen-transactions" style={{ gap: 16 }}>
      <ScreenHeading
        eyebrow="НИЧЕГО НЕ ТЕРЯЕТСЯ"
        title="Ваши операции"
        subtitle="Каждая мелочь складывается в общую картину."
      />
      <View style={{ gap: 8 }}>
        <Row style={{ gap: 8 }}>
          <Segments
            style={{ flex: 1 }}
            value={period}
            onChange={changePeriod}
            options={[
              { value: "month", label: "Месяц" },
              { value: "all", label: "Вся история" },
            ]}
          />
          <IconButton
            name="add"
            label="Добавить операцию"
            onPress={() => open({ type: "transaction" })}
            style={{ backgroundColor: C.green }}
            color="#fff"
          />
        </Row>
        {period === "month" ? (
          <MonthPicker
            month={month}
            onChange={(value) => {
              setMonth(value);
              setLimit(60);
            }}
          />
        ) : (
          <Txt style={{ color: C.muted, fontSize: 12 }}>
            С начала учёта по сегодня
          </Txt>
        )}
      </View>
      <TransactionFilters
        query={query}
        setQuery={(value) => {
          setQuery(value);
          setLimit(60);
        }}
        type={type}
        setType={(value) => {
          setType(value);
          setLimit(60);
        }}
        account={account}
        setAccount={(value) => {
          setAccount(value);
          setLimit(60);
        }}
        category={category}
        setCategory={(value) => {
          setCategory(value);
          setLimit(60);
        }}
        onReset={resetFilters}
      />
      <View style={{ gap: 8 }}>
        <TransactionTotals income={income} expense={expense} />
        <Txt
          testID="transaction-results-summary"
          style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}
        >
          По выбранным фильтрам · операций: {filtered.length}.{" "}
          {period === "all" ? "За всю историю" : "За выбранный месяц"}; суммы по
          всем найденным операциям.
          {category !== "all"
            ? " Расходы — только часть выбранной категории."
            : ""}
        </Txt>
      </View>
      {filtered.length > 0 ? (
        <TransactionGroups groups={groups} open={open} />
      ) : (
        <TransactionListEmpty
          hasHistory={hasHistory}
          hasFilters={hasFilters}
          period={period}
          onAdd={() => open({ type: "transaction" })}
          onReset={resetFilters}
          onAllHistory={() => changePeriod("all")}
        />
      )}
      {filtered.length > limit && (
        <Button
          variant="secondary"
          label="Показать ещё"
          onPress={() => setLimit((n) => n + 60)}
        />
      )}
      <TransactionListDetails onExport={() => open({ type: "export" })} />
    </View>
  );
}
