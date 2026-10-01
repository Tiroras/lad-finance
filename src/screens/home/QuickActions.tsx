import { View, Pressable, StyleSheet } from "react-native";
import {
  font,
  Txt,
  Row,
  Icon,
  interactionStyles,
  TourTarget,
  useTourAction,
} from "../../shared/ui";
import type { OpenSheet } from "../../application/navigation/types";

export function QuickActions({ open }: { open: OpenSheet }) {
  const tourAction = useTourAction();
  return (
    <Row style={{ gap: 10 }}>
      {(
        [
          {
            icon: "add-outline",
            label: "Расход",
            tourId: "home.expense",
            sheet: { type: "transaction", transactionType: "expense" },
          },
          {
            icon: "swap-horizontal-outline",
            label: "Перевод",
            tourId: "home.transfer",
            sheet: { type: "transaction", transactionType: "transfer" },
          },
          {
            icon: "scan-outline",
            label: "Проверить покупку",
            tourId: "home.simulate",
            sheet: { type: "simulate" },
          },
        ] as const
      ).map((action) => (
        <TourTarget key={action.label} id={action.tourId} style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => {
              open(action.sheet);
              tourAction(action.tourId);
            }}
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
        </TourTarget>
      ))}
    </Row>
  );
}

const st = StyleSheet.create({
  quickAction: { alignItems: "center", gap: 9, paddingVertical: 2 },
  quickIcon: {
    backgroundColor: "#EAF0E3",
    height: 46,
    width: 57,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
});
