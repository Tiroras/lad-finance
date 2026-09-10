import { View, ScrollView } from "react-native";
import { C, font, Txt, Chip } from "../ui";
import { useFinance } from "../store";

export function AccountPicker({
  selected,
  onChange,
  exclude,
  spendingOnly = false,
  label = "Счёт",
}: {
  selected: string;
  onChange: (id: string) => void;
  exclude?: string;
  spendingOnly?: boolean;
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
            (a) => a.id !== exclude && (!spendingOnly || a.kind === "spending"),
          )
          .map((a) => (
            <Chip
              label={a.name}
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
