import { Platform, Switch, type SwitchProps } from "react-native";
import { C } from "./theme";

export function Toggle({ value = false, style, ...props }: SwitchProps) {
  // React Native Web uses a separate color prop for the active thumb.
  const platformColors =
    Platform.OS === "web"
      ? { activeThumbColor: C.lime }
      : { ios_backgroundColor: C.border };
  return (
    <Switch
      {...props}
      {...platformColors}
      value={value}
      trackColor={{ false: C.border, true: C.green }}
      thumbColor={value ? C.lime : C.surface}
      style={[style, props.disabled && { opacity: 0.5 }]}
    />
  );
}
