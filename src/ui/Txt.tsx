import { type ComponentProps } from "react";
import { Text, StyleSheet } from "react-native";
import { C, font } from "./theme";

export function Txt({
  children,
  style,
  numberOfLines,
  ...rest
}: ComponentProps<typeof Text>) {
  return (
    <Text {...rest} numberOfLines={numberOfLines} style={[s.text, style]}>
      {children}
    </Text>
  );
}

const s = StyleSheet.create({
  text: { fontFamily: font.regular, fontSize: 14, color: C.ink },
});
