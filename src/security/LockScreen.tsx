import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Button, C, font, IconTile, Txt } from "../ui";
import { useSecurity } from "./SecurityProvider";

export function LockScreen({ compact = false }: { compact?: boolean }) {
  const { busy, error, unlock } = useSecurity();
  return (
    <View
      style={[styles.screen, compact && { flex: 0, paddingVertical: 36 }]}
      accessibilityViewIsModal
    >
      <IconTile name="lock-closed-outline" size={70} />
      <Txt style={{ fontFamily: font.extra, fontSize: 27 }}>
        Лад под защитой
      </Txt>
      <Txt style={{ textAlign: "center", color: C.muted, lineHeight: 22 }}>
        Подтвердите вход с помощью Face ID, отпечатка или кода устройства.
      </Txt>
      {!!error && (
        <Txt
          accessibilityRole="alert"
          style={{
            color: C.red,
            textAlign: "center",
            fontSize: 12,
            lineHeight: 20,
          }}
        >
          {error}
        </Txt>
      )}
      {busy ? (
        <ActivityIndicator color={C.green} />
      ) : (
        <Button
          label="Разблокировать Лад"
          icon="lock-open-outline"
          onPress={() => void unlock()}
          style={{ alignSelf: "stretch" }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 22,
  },
});
