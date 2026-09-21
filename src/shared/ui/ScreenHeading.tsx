import { View, StyleSheet } from "react-native";
import { C, font } from "./theme";
import { Txt } from "./Txt";

export function ScreenHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Txt style={st.eyebrow}>{eyebrow}</Txt>
      <Txt style={st.pageTitle}>{title}</Txt>
      <Txt style={st.subtitle}>{subtitle}</Txt>
    </View>
  );
}

const st = StyleSheet.create({
  eyebrow: {
    color: "#8B9585",
    fontFamily: font.semibold,
    fontSize: 9,
    letterSpacing: 1.55,
  },
  pageTitle: {
    fontFamily: font.extra,
    fontSize: 29,
    letterSpacing: -1.1,
    lineHeight: 37,
  },
  subtitle: { color: C.muted, fontSize: 12, lineHeight: 20 },
});
