import { View, StyleSheet } from "react-native";
import { useFinance } from "../../store";
import { C, font, Txt, Row } from "../../ui";
import { dateLabel } from "../../domain/finance";

export function HomeHeader() {
  const { state, today } = useFinance();
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <View style={{ flex: 1, gap: 7 }}>
        <Txt style={st.eyebrow}>ВАША ФИНАНСОВАЯ КАРТИНА</Txt>
        <Txt style={st.pageTitle}>
          {state.settings.name
            ? `${state.settings.name}, всё на виду.`
            : "Больше ясности."}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 13 }}>
          Меньше забот о деньгах. Больше жизни.
        </Txt>
      </View>
      <View style={st.dayBadge}>
        <Txt style={{ fontSize: 19, fontFamily: font.bold }}>
          {today.slice(-2)}
        </Txt>
        <Txt
          style={{ color: C.muted, fontSize: 9, textTransform: "uppercase" }}
        >
          {dateLabel(today, { month: "short" }).replace(".", "")}
        </Txt>
      </View>
    </Row>
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
  dayBadge: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#fff",
    width: 47,
    height: 55,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
});
