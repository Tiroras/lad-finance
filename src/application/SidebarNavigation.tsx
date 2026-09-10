import { View, Pressable, StyleSheet } from "react-native";
import { C, font, Txt, Row, Icon, Button, interactionStyles } from "../ui";
import type { Tab, OpenSheet, Navigate } from "../navigation/types";
import { Brand } from "./Brand";
import { tabs } from "../navigation/tabs";

export function SidebarNavigation({
  tab,
  navigate,
  open,
}: {
  tab: Tab;
  navigate: Navigate;
  open: OpenSheet;
}) {
  return (
    <View style={st.sidebar}>
      <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
        <Brand />
        <Txt style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>
          Финансы в вашем ритме
        </Txt>
      </View>
      <View style={{ marginTop: 56, gap: 8 }}>
        {tabs.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.id }}
            onPress={() => navigate(item.id)}
            style={({ pressed }) => [
              st.sideItem,
              tab === item.id && { backgroundColor: "#E8EFDF" },
              pressed && interactionStyles.pressed,
            ]}
          >
            <Icon
              name={tab === item.id ? item.active : item.icon}
              size={20}
              color={tab === item.id ? C.green : "#92998C"}
            />
            <Txt
              style={{
                fontFamily: tab === item.id ? font.bold : font.medium,
                fontSize: 13,
                color: tab === item.id ? C.green : C.muted,
              }}
            >
              {item.label}
            </Txt>
            {tab === item.id && (
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  marginLeft: "auto",
                  backgroundColor: "#6F8B56",
                }}
              />
            )}
          </Pressable>
        ))}
      </View>
      <Button
        label="Добавить операцию"
        icon="add"
        style={{ marginTop: 32 }}
        onPress={() => open({ type: "transaction" })}
      />
      <View style={{ flex: 1 }} />
      <View style={st.sideNote}>
        <Icon name="leaf-outline" size={26} color="#839975" />
        <Txt
          style={{
            fontSize: 15,
            fontFamily: font.bold,
            marginTop: 13,
            lineHeight: 23,
          }}
        >
          Спокойствие начинается с ясности.
        </Txt>
        <Txt
          style={{
            color: "#919B88",
            fontSize: 10,
            lineHeight: 18,
            marginTop: 9,
          }}
        >
          Один маленький шаг для себя каждый день.
        </Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Настройки"
        onPress={() => open({ type: "settings" })}
        style={st.sideItem}
      >
        <Icon name="settings-outline" size={20} color={C.muted} />
        <Txt style={{ color: C.muted, fontSize: 12 }}>Настройки</Txt>
      </Pressable>
      <Row style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 6 }}>
        <Icon name="lock-closed-outline" size={11} color="#9AA28F" />
        <Txt style={{ color: "#9AA28F", fontSize: 9 }}>
          Данные на вашем устройстве
        </Txt>
      </Row>
    </View>
  );
}

const st = StyleSheet.create({
  sidebar: {
    width: 245,
    paddingHorizontal: 14,
    paddingTop: 26,
    backgroundColor: "#F2F5EB",
    borderRightWidth: 1,
    borderRightColor: "#E5EADF",
  },
  sideItem: {
    minHeight: 51,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingHorizontal: 20,
    borderRadius: 13,
  },
  sideNote: { padding: 22, marginBottom: 24 },
});
