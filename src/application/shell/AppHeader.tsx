import { View, Pressable, StyleSheet } from "react-native";
import { useFinance } from "../../state/finance";
import {
  C,
  font,
  Txt,
  Row,
  Icon,
  IconButton,
  interactionStyles,
} from "../../shared/ui";
import type { OpenSheet } from "../navigation/types";
import { Brand } from "./Brand";
import { TourTarget, useTourAction } from "../../shared/ui/Tour";

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
  const { state, profiles, activeProfile } = useFinance();
  const tourAction = useTourAction();
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
      {profiles.length > 1 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Текущий профиль: ${activeProfile.name}. Открыть профили`}
          onPress={() => open({ type: "profiles" })}
          style={({ pressed }) => [
            st.profileBadge,
            pressed && interactionStyles.pressed,
          ]}
        >
          <Txt
            numberOfLines={1}
            style={{
              color: C.green,
              fontSize: 11,
              fontFamily: font.semibold,
              flexShrink: 1,
            }}
          >
            {activeProfile.name}
          </Txt>
          <Icon name="chevron-down" size={12} color={C.green} />
        </Pressable>
      )}
      <IconButton
        name={hidden ? "eye-off-outline" : "eye-outline"}
        label={hidden ? "Показать баланс" : "Скрыть баланс"}
        onPress={onToggleBalance}
        color="#8A9383"
        style={{ width: 34, height: 38 }}
      />
      <TourTarget id="header.settings">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Профиль и настройки"
          onPress={() => {
            open({ type: "settings" });
            tourAction("header.settings");
          }}
          style={st.avatar}
        >
          <Txt style={{ fontFamily: font.bold, fontSize: 13 }}>
            {state.settings.name
              ? state.settings.name[0].toLocaleUpperCase("ru-RU")
              : "Я"}
          </Txt>
        </Pressable>
      </TourTarget>
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
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    maxWidth: 148,
    flexShrink: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: C.soft,
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
