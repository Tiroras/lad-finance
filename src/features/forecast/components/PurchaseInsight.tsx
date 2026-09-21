import { View, Pressable, StyleSheet } from "react-native";
import { C, font, Txt, Row, Icon, interactionStyles } from "../../../shared/ui";
import type { OpenSheet } from "../../../application/navigation/types";

export function PurchaseInsight({
  open,
  wide,
}: {
  open: OpenSheet;
  wide: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => open({ type: "simulate" })}
      style={({ pressed }) => [
        st.insight,
        pressed && interactionStyles.pressed,
      ]}
    >
      <View style={{ flex: 1, gap: 8 }}>
        <Row style={{ gap: 6 }}>
          <Icon name="sparkles-outline" size={14} color="#81729C" />
          <Txt
            style={{
              fontFamily: font.bold,
              color: "#81729C",
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            НА ШАГ ВПЕРЁД
          </Txt>
        </Row>
        <Txt style={{ fontFamily: font.bold, fontSize: 16 }}>
          А если купить сейчас?
        </Txt>
        <Txt style={{ fontSize: 11, color: "#898196", lineHeight: 18 }}>
          Примерьте покупку к своему бюджету.{wide ? "\n" : " "}План покажет,
          что изменится.
        </Txt>
      </View>
      <View style={st.insightArrow}>
        <Icon name="arrow-forward" size={22} color="#81729C" />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  insight: {
    backgroundColor: C.lavender,
    padding: 20,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E8E4F0",
  },
  insightArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#D4CCE0",
    alignItems: "center",
    justifyContent: "center",
  },
});
