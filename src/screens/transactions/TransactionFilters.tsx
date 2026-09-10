import { ScrollView } from "react-native";
import { useFinance } from "../../store";
import { Chip, Segments, Field } from "../../ui";

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
  type: string;
  setType: (value: string) => void;
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
      <Segments
        value={type}
        onChange={setType}
        options={[
          { value: "all", label: "Все" },
          { value: "expense", label: "Расходы" },
          { value: "income", label: "Доходы" },
          { value: "transfer", label: "Переводы" },
        ]}
      />
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
        {state.categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.icon}
            active={c.id === category}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </ScrollView>
    </>
  );
}
