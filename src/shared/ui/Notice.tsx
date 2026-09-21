import { type ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { C } from "./theme";
import { Icon } from "./Icon";
import { Txt } from "./Txt";

export function Notice({
  children,
  tone = "normal",
}: {
  children: ReactNode;
  tone?: "normal" | "warning";
}) {
  return (
    <View
      style={[s.notice, tone === "warning" && { backgroundColor: "#FBF0E7" }]}
    >
      <Icon
        name={
          tone === "warning" ? "information-circle-outline" : "sparkles-outline"
        }
        size={19}
        color={tone === "warning" ? C.orange : C.green}
      />
      <Txt
        style={{
          flex: 1,
          fontSize: 12,
          lineHeight: 20,
          color: tone === "warning" ? "#8A643F" : C.green,
        }}
      >
        {children}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  notice: {
    backgroundColor: C.soft,
    borderRadius: 15,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
});
