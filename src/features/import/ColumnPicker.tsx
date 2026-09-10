import { ScrollView, View } from "react-native";
import { C, Chip, font, Txt } from "../../ui";

export function ColumnPicker({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: C.muted }}>
        {label}
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label="Не выбрана"
          active={value === -1}
          onPress={() => onChange(-1)}
        />
        {headers.map((header, index) => (
          <Chip
            key={index}
            label={`${index + 1}. ${header}`}
            active={value === index}
            onPress={() => onChange(index)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
