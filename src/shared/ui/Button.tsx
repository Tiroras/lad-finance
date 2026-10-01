import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C, font } from "./theme";
import { interactionStyles } from "./interactionStyles";
import { Icon, type IName } from "./Icon";
import { Txt } from "./Txt";
import { TourTarget, useTourAction } from "./Tour";
import { tourControlStyle } from "./tourControlStyle";

export function Button({
  label,
  accessibilityLabel = label,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
  style,
  tourId,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  icon?: IName;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  tourId?: string;
}) {
  const tourAction = useTourAction();
  const textColor =
    variant === "primary" ? "#fff" : variant === "danger" ? C.red : C.green;
  const backgroundColor =
    variant === "primary" ? C.green : variant === "danger" ? "#FAECE9" : C.soft;
  const tourStyle = tourId
    ? tourControlStyle([s.button, { backgroundColor }, style])
    : undefined;
  const control = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        onPress();
        if (tourId) tourAction(tourId);
      }}
      style={({ pressed }) => [
        tourStyle ? tourStyle.control : s.button,
        !tourStyle && { backgroundColor },
        !tourStyle && style,
        disabled && { opacity: 0.45 },
        pressed && interactionStyles.pressed,
      ]}
    >
      {icon && <Icon name={icon} size={19} color={textColor} />}
      <Txt
        style={{
          fontFamily: font.bold,
          color: textColor,
          fontSize: 14,
          flexShrink: 1,
          textAlign: "center",
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
  return tourId && tourStyle ? (
    <TourTarget id={tourId} style={tourStyle.target}>
      {control}
    </TourTarget>
  ) : (
    control
  );
}

const s = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 15,
    paddingHorizontal: 19,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
});
