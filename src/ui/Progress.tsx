import { View } from "react-native";
import { C } from "./theme";

export function Progress({
  value,
  color = C.green,
  background = C.soft,
  height = 5,
}: {
  value: number;
  color?: string;
  background?: string;
  height?: number;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.max(0, Math.min(1, value)) * 100),
      }}
      style={{
        height,
        backgroundColor: background,
        borderRadius: height,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height,
          backgroundColor: color,
          borderRadius: height,
        }}
      />
    </View>
  );
}
