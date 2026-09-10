import { View } from "react-native";
import { C, font, Txt, Chip } from "../ui";
import { useFinance } from "../store";
import type { CategoryId } from "../domain/types";

export function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
}) {
  const { state } = useFinance();
  return (
    <View style={{ gap: 10 }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: C.muted }}>
        Категория
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {state.categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.icon}
            active={c.id === value}
            onPress={() => onChange(c.id)}
          />
        ))}
      </View>
    </View>
  );
}
