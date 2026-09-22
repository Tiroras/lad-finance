import { ScrollView, View } from "react-native";
import { Chip } from "./Chip";
import type { IName } from "./Icon";
import { C, font } from "./theme";
import { Txt } from "./Txt";

export function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  horizontal = false,
  gap = 10,
}: {
  label: string;
  options: readonly { value: T; label: string; icon?: IName }[];
  value: T;
  onChange: (value: T) => void;
  horizontal?: boolean;
  gap?: number;
}) {
  const choices = options.map((option) => (
    <Chip
      key={option.value}
      label={option.label}
      icon={option.icon}
      active={value === option.value}
      onPress={() => onChange(option.value)}
    />
  ));
  return (
    <View style={{ gap }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: C.muted }}>
        {label}
      </Txt>
      {options.length > 0 &&
        (horizontal ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {choices}
          </ScrollView>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {choices}
          </View>
        ))}
    </View>
  );
}
