import { Pressable, StyleSheet } from "react-native";
import { C, font } from "./theme";
import { interactionStyles } from "./interactionStyles";
import { Icon, type IName } from "./Icon";
import { Txt } from "./Txt";

export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: IName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        active && { backgroundColor: C.green, borderColor: C.green },
        pressed && interactionStyles.pressed,
      ]}
    >
      {icon && <Icon name={icon} size={16} color={active ? "#fff" : C.muted} />}
      <Txt
        style={{
          fontSize: 12,
          fontFamily: font.semibold,
          color: active ? "#fff" : C.muted,
          flexShrink: 1,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    maxWidth: "100%",
    minHeight: 39,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#fff",
  },
});
