import { View, Pressable, StyleSheet } from "react-native";
import { font, Txt, Row, Icon, interactionStyles } from "../../shared/ui";
import type { OpenSheet } from "../../application/navigation/types";

export function QuickActions({ open }: { open: OpenSheet }) {
  return (
    <Row style={{ gap: 10 }}>
      {(
        [
          {
            icon: "add-outline",
            label: "Расход",
            sheet: { type: "transaction", transactionType: "expense" },
          },
          {
            icon: "swap-horizontal-outline",
            label: "Перевод",
            sheet: { type: "transaction", transactionType: "transfer" },
          },
          {
            icon: "scan-outline",
            label: "Проверить покупку",
            sheet: { type: "simulate" },
          },
        ] as const
      ).map((action) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          key={action.label}
          onPress={() => open(action.sheet)}
          style={({ pressed }) => [
            st.quickAction,
            pressed && interactionStyles.pressed,
          ]}
        >
          <View style={st.quickIcon}>
            <Icon name={action.icon} size={22} />
          </View>
          <Txt style={{ fontFamily: font.semibold, fontSize: 10 }}>
            {action.label}
          </Txt>
        </Pressable>
      ))}
    </Row>
  );
}

const st = StyleSheet.create({
  quickAction: { flex: 1, alignItems: "center", gap: 9, paddingVertical: 2 },
  quickIcon: {
    backgroundColor: "#EAF0E3",
    height: 46,
    width: 57,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
});
