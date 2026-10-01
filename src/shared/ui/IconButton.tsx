import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C } from "./theme";
import { interactionStyles } from "./interactionStyles";
import { Icon, type IName } from "./Icon";
import { TourTarget, useTourAction } from "./Tour";
import { tourControlStyle } from "./tourControlStyle";

export function IconButton({
  name,
  label,
  onPress,
  style,
  color = C.ink,
  tourId,
}: {
  name: IName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
  tourId?: string;
}) {
  const tourAction = useTourAction();
  const tourStyle = tourId
    ? tourControlStyle([s.iconButton, style])
    : undefined;
  const control = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        onPress();
        if (tourId) tourAction(tourId);
      }}
      style={({ pressed }) => [
        tourStyle ? tourStyle.control : s.iconButton,
        !tourStyle && style,
        pressed && interactionStyles.pressed,
      ]}
    >
      <Icon name={name} color={color} />
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
  iconButton: {
    height: 42,
    width: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
