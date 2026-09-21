import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { C, font, Txt, Icon, interactionStyles } from "../../shared/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Tab, OpenSheet, Navigate } from "./types";
import { tabs } from "./tabs";

export function BottomNavigation({
  tab,
  navigate,
  open,
}: {
  tab: Tab;
  navigate: Navigate;
  open: OpenSheet;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[st.bottomNav, { paddingBottom: Math.max(12, insets.bottom) }]}
    >
      {tabs.map((item, index) => (
        <React.Fragment key={item.id}>
          {index === 2 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить операцию"
              onPress={() => open({ type: "transaction" })}
              style={({ pressed }) => [
                st.addButton,
                pressed && interactionStyles.pressed,
              ]}
            >
              <Icon name="add" size={29} color="#fff" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: tab === item.id }}
            onPress={() => navigate(item.id)}
            style={st.navItem}
          >
            <Icon
              name={tab === item.id ? item.active : item.icon}
              size={21}
              color={tab === item.id ? C.green : "#A2AA9B"}
            />
            <Txt
              style={{
                fontFamily: tab === item.id ? font.bold : font.medium,
                fontSize: 9,
                color: tab === item.id ? C.green : "#A2AA9B",
              }}
            >
              {item.label}
            </Txt>
            <View
              style={{
                height: 3,
                width: 3,
                borderRadius: 2,
                backgroundColor: tab === item.id ? "#7B9464" : "transparent",
              }}
            />
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 12,
    paddingHorizontal: 10,
    backgroundColor: "#FCFDF9",
    borderTopWidth: 1,
    borderTopColor: "#E8ECE1",
  },
  addButton: {
    backgroundColor: C.green,
    height: 49,
    width: 49,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 9,
    marginBottom: 3,
    boxShadow: "0 4px 10px rgba(35,75,60,.18)",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingTop: 3,
    minHeight: 48,
    justifyContent: "center",
  },
});
