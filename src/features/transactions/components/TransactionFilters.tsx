import { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { categoryLabel, orderedCategories } from "../../../domain/categories";
import type { TransactionFilterType } from "../../../domain/transactionList";
import { useFinance } from "../../../state/finance";
import {
  C,
  Chip,
  Segments,
  Field,
  Txt,
  Icon,
  font,
  interactionStyles,
  useTourTargetActive,
} from "../../../shared/ui";

const typeLabels: Record<TransactionFilterType, string> = {
  all: "Все типы",
  expense: "Расходы",
  income: "Доходы",
  transfer: "Переводы",
  debt: "Долги",
};

export function TransactionFilters({
  query,
  setQuery,
  type,
  setType,
  account,
  setAccount,
  category,
  setCategory,
  onReset,
}: {
  query: string;
  setQuery: (value: string) => void;
  type: TransactionFilterType;
  setType: (value: TransactionFilterType) => void;
  account: string;
  setAccount: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  onReset: () => void;
}) {
  const { state } = useFinance();
  const [expanded, setExpanded] = useState(false);
  const tourExpanded = useTourTargetActive("transactions.expense");
  const isExpanded = expanded || tourExpanded;
  useEffect(() => {
    if (tourExpanded) setExpanded(true);
  }, [tourExpanded]);
  const active = [
    ...(type !== "all" ? [typeLabels[type]] : []),
    ...(account !== "all"
      ? [
          state.accounts.find((item) => item.id === account)?.name ??
            "Счёт удалён",
        ]
      : []),
    ...(category !== "all"
      ? [
          `${categoryLabel(state, category)}${state.categories.find((item) => item.id === category)?.archived ? " · архив" : ""}`,
        ]
      : []),
  ];
  const hasFilters = active.length > 0 || query.trim().length > 0;
  return (
    <View style={{ gap: 10 }}>
      <Field
        accessibilityLabel="Поиск операций"
        placeholder="По названию или заметке"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={Keyboard.dismiss}
      />
      <View style={s.filterActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            active.length ? `Фильтры: ${active.length}` : "Фильтры"
          }
          accessibilityState={{ expanded: isExpanded }}
          aria-expanded={isExpanded}
          onPress={() => {
            Keyboard.dismiss();
            setExpanded(!isExpanded);
          }}
          style={({ pressed }) => [
            s.disclosure,
            pressed && interactionStyles.pressed,
          ]}
        >
          <Icon name="options-outline" size={18} color={C.green} />
          <Txt style={s.disclosureLabel}>
            {active.length ? `Фильтры: ${active.length}` : "Фильтры"}
          </Txt>
          <Icon
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={17}
            color={C.green}
          />
        </Pressable>
        {hasFilters && <Chip label="Сбросить фильтры" onPress={onReset} />}
      </View>
      {active.length > 0 && (
        <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
          {active.join(" · ")}
        </Txt>
      )}
      {isExpanded && (
        <View style={{ gap: 12 }}>
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
            {state.accounts.map((item) => (
              <Chip
                key={item.id}
                label={item.name}
                active={item.id === account}
                onPress={() => setAccount(item.id)}
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
            {orderedCategories(state).map((item) => (
              <Chip
                key={item.id}
                label={`${categoryLabel(state, item.id)}${item.archived ? " · архив" : ""}`}
                icon={item.icon}
                active={item.id === category}
                onPress={() => setCategory(item.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  filterActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  disclosureLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: C.green,
    flexShrink: 1,
  },
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
