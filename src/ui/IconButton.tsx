import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C } from "./theme";
import { interactionStyles } from "./interactionStyles";
import { Icon, type IName } from "./Icon";

export function IconButton({
  name,
  label,
  onPress,
  style,
  color = C.ink,
}: {
  name: IName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        style,
        pressed && interactionStyles.pressed,
      ]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  iconButton: {
    height: 42,
    width: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
