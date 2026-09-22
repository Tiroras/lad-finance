import { useMemo, useState } from "react";
import { View } from "react-native";
import { categoryMatches } from "../../domain/categories";
import {
  expenseContributions,
  transactionIncomeAmount,
} from "../../domain/transactionAmounts";
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
            t.date <= today &&
            (type === "all" ||
              (type === "debt"
                ? !!t.debtId
                : type === "expense"
                  ? expenseContributions(state, t).length > 0
                  : type === "income"
                    ? t.type === "income" && !t.refundOf && !t.debtId
                    : t.type === type)) &&
            (account === "all" ||
              t.accountId === account ||
              t.toAccountId === account) &&
            (category === "all" ||
              (t.type === "expense" || t.refundOf
                ? expenseContributions(state, t).some((part) =>
                    categoryMatches(state, part.category, category),
                  )
                : !t.debtId && categoryMatches(state, t.category, category))) &&
            `${t.title} ${t.note ?? ""}`
              .toLocaleLowerCase("ru-RU")
              .includes(query.trim().toLocaleLowerCase("ru-RU")),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state, today, month, type, query, account, category],
  );
  const income = filtered.reduce(
      (sum, transaction) => sum + transactionIncomeAmount(state, transaction),
      0,
    ),
    expense = filtered.reduce(
      (sum, transaction) =>
        sum +
        expenseContributions(state, transaction)
          .filter(
            (part) =>
              category === "all" ||
              categoryMatches(state, part.category, category),
          )
          .reduce((value, part) => value + part.amount, 0),
      0,
    );
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
