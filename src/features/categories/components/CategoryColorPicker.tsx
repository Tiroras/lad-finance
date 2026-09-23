import { Pressable, StyleSheet, View } from "react-native";
import { C, Icon, Txt, font, interactionStyles } from "../../../shared/ui";

export const categoryColors = [
  ["Зелёный", "#365A46", "#EAF0E8"],
  ["Изумрудный", "#26745D", "#E3F2EB"],
  ["Бирюзовый", "#287F83", "#E2F2F2"],
  ["Оливковый", "#697539", "#EFF2E2"],
  ["Синий", "#52768A", "#E8F0F5"],
  ["Голубой", "#397BAC", "#E6F1FA"],
  ["Индиго", "#565A9D", "#ECECF8"],
  ["Сиреневый", "#81729C", "#EEEBF5"],
  ["Фиолетовый", "#8554A0", "#F2E9F8"],
  ["Розовый", "#A7547B", "#F8E8F0"],
  ["Красный", "#B34E52", "#FAE9EA"],
  ["Коралловый", "#B6614F", "#FBEDE7"],
  ["Терракотовый", "#A2684C", "#F8EDE4"],
  ["Золотистый", "#9B7A2C", "#F8F1DA"],
  ["Коричневый", "#82624D", "#F1EAE3"],
  ["Серый", "#697780", "#EDF0F2"],
] as const;

export function CategoryColorPicker({
  color,
  background,
  onChange,
}: {
  color: string;
  background: string;
  onChange: (color: string, background: string) => void;
}) {
  const selected = categoryColors.find(
    ([, value, bg]) => color === value && background === bg,
  );
  const options: readonly (readonly [string, string, string])[] = selected
    ? categoryColors
    : [...categoryColors, ["Текущий цвет", color, background]];
  return (
    <View style={{ gap: 10 }}>
      <Txt style={s.label}>Цвет · {selected?.[0] ?? "Текущий цвет"}</Txt>
      <View
        style={s.palette}
        accessibilityRole="radiogroup"
        accessibilityLabel="Цвет категории"
      >
        {options.map(([label, value, bg]) => {
          const active = color === value && background === bg;
          return (
            <Pressable
              key={`${value}-${bg}`}
              accessibilityRole="radio"
              accessibilityLabel={`Цвет: ${label}`}
              accessibilityState={{ checked: active }}
              aria-checked={active}
              onPress={() => onChange(value, bg)}
              style={({ pressed }) => [
                s.swatch,
                { borderColor: active ? value : "transparent" },
                pressed && interactionStyles.pressed,
              ]}
            >
              <View style={[s.sample, { backgroundColor: value }]}>
                {active && (
                  <Icon name="checkmark" size={20} color={C.surface} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: font.semibold, fontSize: 12, color: C.muted },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sample: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
