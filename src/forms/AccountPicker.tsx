import { ScrollView, View } from "react-native";
import type { CurrencyCode } from "../domain/currency";
import { useFinance } from "../store";
import { C, Chip, font, Txt } from "../ui";

export function AccountPicker({
  selected,
  onChange,
  exclude,
  spendingOnly = false,
  savingsOnly = false,
  currency,
  label = "Счёт",
}: {
  selected: string;
  onChange: (id: string) => void;
  exclude?: string;
  spendingOnly?: boolean;
  savingsOnly?: boolean;
  currency?: CurrencyCode;
  label?: string;
}) {
  const { state } = useFinance();
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: C.muted }}>
        {label}
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {state.accounts
          .filter(
            (a) =>
              a.id !== exclude &&
              (!spendingOnly || a.kind === "spending") &&
              (!savingsOnly || a.kind === "savings") &&
              (!currency || (a.currency ?? "RUB") === currency),
          )
          .map((a) => (
            <Chip
              label={`${a.name}${a.currency && a.currency !== "RUB" ? ` · ${a.currency}` : ""}`}
              icon={a.icon}
              key={a.id}
              active={selected === a.id}
              onPress={() => onChange(a.id)}
            />
          ))}
      </ScrollView>
    </View>
  );
}
