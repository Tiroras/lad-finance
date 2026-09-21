import { View, StyleSheet } from "react-native";
import { useFinance } from "../../state/finance";
import { C, Txt, Icon } from "../../shared/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function AppToast({ wide }: { wide: boolean }) {
  const { toast } = useFinance();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      style={[st.toast, { bottom: wide ? 25 : 95 + insets.bottom }]}
    >
      <Icon name="checkmark-circle" size={18} color={C.lime} />
      <Txt
        accessibilityRole="alert"
        style={{ color: "#fff", fontSize: 12, flexShrink: 1 }}
      >
        {toast}
      </Txt>
    </View>
  );
}

const st = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    left: 24,
    right: 24,
    maxWidth: 500,
    marginHorizontal: "auto",
    padding: 16,
    backgroundColor: C.green,
    borderRadius: 16,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    boxShadow: "0 5px 15px rgba(20,35,25,.15)",
  },
});
