import { View } from "react-native";
import { C, font, Txt, Chip } from "../../../shared/ui";
import { useFinance } from "../../../state/finance";
import type { CategoryId } from "../../../domain/types";
import { categoryLabel, orderedCategories } from "../../../domain/categories";

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
        {orderedCategories(state)
          .filter((c) => !c.archived || c.id === value)
          .map((c) => (
            <Chip
              key={c.id}
              label={`${categoryLabel(state, c.id)}${c.archived ? " · архив" : ""}`}
              icon={c.icon}
              active={c.id === value}
              onPress={() => onChange(c.id)}
            />
          ))}
      </View>
    </View>
  );
}
