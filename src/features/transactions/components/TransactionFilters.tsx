import { categoryLabel, orderedCategories } from "../../../domain/categories";
import type { TransactionFilterType } from "../../../domain/transactionList";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFinance } from "../../../state/finance";
import { C, Chip, Segments, Field } from "../../../shared/ui";

export function TransactionFilters({
  query,
  setQuery,
  type,
  setType,
  account,
  setAccount,
  category,
  setCategory,
}: {
  query: string;
  setQuery: (value: string) => void;
  type: TransactionFilterType;
  setType: (value: TransactionFilterType) => void;
  account: string;
  setAccount: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
}) {
  const { state } = useFinance();
  return (
    <>
      <Field
        accessibilityLabel="Поиск операций"
        placeholder="Найти кофе, продукты, такси…"
        value={query}
        onChangeText={setQuery}
      />
      <View style={s.typeFilters}>
        <Segments
          style={s.typeFilterRow}
          value={type}
          onChange={setType}
          options={[
            { value: "all", label: "Все" },
            {
              value: "expense",
              label: "Расходы",
              tourId: "transactions.expense",
            },
            { value: "income", label: "Доходы" },
          ]}
        />
        <Segments
          style={s.typeFilterRow}
          value={type}
          onChange={setType}
          options={[
            { value: "transfer", label: "Переводы" },
            { value: "debt", label: "Долги" },
          ]}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label="Все счета"
          active={account === "all"}
          onPress={() => setAccount("all")}
        />
        {state.accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            active={a.id === account}
            onPress={() => setAccount(a.id)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label="Все категории"
          active={category === "all"}
          onPress={() => setCategory("all")}
        />
        {orderedCategories(state).map((c) => (
          <Chip
            key={c.id}
            label={`${categoryLabel(state, c.id)}${c.archived ? " · архив" : ""}`}
            icon={c.icon}
            active={c.id === category}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  typeFilters: {
    gap: 3,
    padding: 4,
    backgroundColor: C.soft,
    borderRadius: 13,
  },
  typeFilterRow: {
    padding: 0,
    backgroundColor: "transparent",
  },
});
