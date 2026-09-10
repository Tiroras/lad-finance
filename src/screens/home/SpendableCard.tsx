import { View, Pressable, StyleSheet } from "react-native";
import { useFinance } from "../../store";
import { C, font, Txt, Row, Icon, HeroArt } from "../../ui";
import { dateLabel, money, spendable } from "../../domain/finance";
import type { OpenSheet } from "../../navigation/types";

export function SpendableCard({
  open,
  hidden,
}: {
  open: OpenSheet;
  hidden: boolean;
}) {
  const { state, today } = useFinance();
  const safe = spendable(state, today);
  return (
    <View style={st.hero}>
      <HeroArt />
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ gap: 7 }}>
          <View style={st.heroDot} />
          <Txt style={{ color: "#D7E4D8", fontSize: 12 }}>Можно потратить</Txt>
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Как рассчитана доступная сумма"
          onPress={() => open({ type: "formula" })}
          style={st.heroInfo}
        >
          <Icon name="information" color="#D7E4D8" size={16} />
        </Pressable>
      </Row>
      <Txt adjustsFontSizeToFit numberOfLines={1} style={st.heroAmount}>
        {hidden ? "••• ••• ₽" : money(safe.available)}
      </Txt>
      <Txt style={{ color: "#AFC5B6", fontSize: 11 }}>
        до {dateLabel(safe.payday)} · следующего дохода
      </Txt>
      <View style={st.heroDivider} />
      <Row
        style={{
          justifyContent: "space-between",
          flexWrap: "wrap",
          rowGap: 14,
        }}
      >
        <View style={{ gap: 5 }}>
          <Txt style={{ color: "#AFC5B6", fontSize: 10 }}>
            Комфортно на день
          </Txt>
          <Txt style={{ color: C.lime, fontSize: 22, fontFamily: font.bold }}>
            {hidden ? "••• ₽" : money(safe.daily)}
          </Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => open({ type: "formula" })}
          style={st.heroPill}
        >
          <Icon
            name={
              safe.raw < 0 ? "alert-circle-outline" : "shield-checkmark-outline"
            }
            size={15}
            color={C.lime}
          />
          <Txt
            style={{
              color: C.lime,
              fontSize: 10,
              fontFamily: font.medium,
            }}
          >
            {safe.raw < 0 ? "План требует внимания" : "Счета и цели учтены"}
          </Txt>
        </Pressable>
      </Row>
    </View>
  );
}

const st = StyleSheet.create({
  hero: {
    backgroundColor: C.green,
    borderRadius: 25,
    padding: 24,
    overflow: "hidden",
    boxShadow: "0 8px 22px rgba(35, 75, 60, 0.12)",
  },
  heroDot: { width: 6, height: 6, backgroundColor: C.lime, borderRadius: 3 },
  heroInfo: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#6D8674",
  },
  heroAmount: {
    color: "#F6F8EB",
    fontFamily: font.medium,
    fontSize: 44,
    letterSpacing: -1.9,
    marginTop: 15,
    marginBottom: 7,
  },
  heroDivider: {
    height: 1,
    backgroundColor: "#4A6856",
    opacity: 0.7,
    marginTop: 24,
    marginBottom: 20,
  },
  heroPill: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#355846",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
});
