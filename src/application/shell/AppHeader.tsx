import { View, Pressable, StyleSheet } from "react-native";
import { useFinance } from "../../state/finance";
import { C, font, Txt, Row, IconButton } from "../../shared/ui";
import type { OpenSheet } from "../navigation/types";
import { Brand } from "./Brand";

export function AppHeader({
  wide,
  hidden,
  onToggleBalance,
  open,
}: {
  wide: boolean;
  hidden: boolean;
  onToggleBalance: () => void;
  open: OpenSheet;
}) {
  const { state } = useFinance();
  return (
    <Row style={[st.header, wide && { paddingHorizontal: 38, height: 80 }]}>
      {wide ? (
        <Row style={{ gap: 7 }}>
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: "#87A477",
            }}
          />
          <Txt style={{ color: C.muted, fontSize: 11 }}>
            Ваше личное пространство
          </Txt>
        </Row>
      ) : (
        <Brand small />
      )}
      <View style={{ flex: 1 }} />
      {state.demo && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Деморежим, открыть настройки"
          onPress={() => open({ type: "settings" })}
          style={st.demoBadge}
        >
          <Txt
            style={{
              color: "#7E8E6A",
              fontSize: 9,
              fontFamily: font.bold,
              letterSpacing: 0.7,
            }}
          >
            ДЕМО
          </Txt>
        </Pressable>
      )}
      <IconButton
        name={hidden ? "eye-off-outline" : "eye-outline"}
        label={hidden ? "Показать баланс" : "Скрыть баланс"}
        onPress={onToggleBalance}
        color="#8A9383"
        style={{ width: 34, height: 38 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Профиль и настройки"
        onPress={() => open({ type: "settings" })}
        style={st.avatar}
      >
        <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
          {state.settings.name
            ? state.settings.name[0].toLocaleUpperCase("ru-RU")
            : "Я"}
        </Txt>
      </Pressable>
    </Row>
  );
}

const st = StyleSheet.create({
  header: {
    height: 75,
    paddingHorizontal: 21,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0E9",
  },
  demoBadge: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DAE2CF",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#F2F5EB",
  },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EEDC",
    borderWidth: 3,
    borderColor: "#fff",
  },
});
