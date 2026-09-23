import { useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Icon, type IName } from "./Icon";
import { IconTile } from "./IconTile";
import { Txt } from "./Txt";
import { C, font } from "./theme";
import { interactionStyles } from "./interactionStyles";

type SelectOption<T extends string> = {
  value: T;
  label: string;
  icon?: IName;
  color?: string;
  background?: string;
};

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Выберите из списка",
}: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={s.container}>
      <Txt style={s.label}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => {
          Keyboard.dismiss();
          setExpanded(!expanded);
        }}
        style={({ pressed }) => [
          s.field,
          expanded && { borderColor: C.green },
          pressed && interactionStyles.pressed,
        ]}
      >
        {selected?.icon && (
          <IconTile
            name={selected.icon}
            color={selected.color}
            background={selected.background}
            size={32}
          />
        )}
        <Txt style={[s.value, !selected && { color: C.muted }]}>
          {selected?.label ?? placeholder}
        </Txt>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={C.muted}
        />
      </Pressable>
      {expanded && (
        <View
          style={s.menu}
          accessibilityRole="radiogroup"
          accessibilityLabel={`${label}: варианты`}
        >
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 248 }}
            contentContainerStyle={{ padding: 4 }}
          >
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: option.value === value }}
                aria-checked={option.value === value}
                onPress={() => {
                  onChange(option.value);
                  setExpanded(false);
                }}
                style={({ pressed }) => [
                  s.option,
                  option.value === value && { backgroundColor: C.soft },
                  pressed && interactionStyles.pressed,
                ]}
              >
                {option.icon && (
                  <IconTile
                    name={option.icon}
                    color={option.color}
                    background={option.background}
                    size={32}
                  />
                )}
                <Txt style={s.value}>{option.label}</Txt>
                {option.value === value && (
                  <Icon name="checkmark" size={20} color={C.green} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 8 },
  label: { fontFamily: font.semibold, fontSize: 12, color: C.muted },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  value: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 14 },
  menu: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: C.surface,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    minHeight: 52,
    borderRadius: 10,
  },
});
