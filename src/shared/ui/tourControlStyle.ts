import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

const outerProperties: readonly (keyof ViewStyle)[] = [
  "alignSelf",
  "flex",
  "flexBasis",
  "flexGrow",
  "flexShrink",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginStart",
  "marginEnd",
  "marginHorizontal",
  "marginVertical",
  "position",
  "top",
  "bottom",
  "left",
  "right",
  "start",
  "end",
  "zIndex",
];

/** Keep a measured wrapper in the same place and size as the original control. */
export function tourControlStyle(style: StyleProp<ViewStyle>): {
  target: ViewStyle;
  control: ViewStyle;
} {
  const control: ViewStyle = { ...StyleSheet.flatten(style), flexGrow: 1 };
  const target: ViewStyle = {};
  const flattened = StyleSheet.flatten(style);
  for (const property of outerProperties) {
    if (flattened?.[property] !== undefined) {
      Object.assign(target, { [property]: flattened[property] });
    }
    if (property !== "flexGrow") delete control[property];
  }
  return { target, control };
}
