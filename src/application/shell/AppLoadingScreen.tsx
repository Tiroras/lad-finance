import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useFinanceStatus } from "../../state/finance";
import { C, Txt, Button } from "../../shared/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSecurity, LockScreen } from "../../features/security";
import { RecoveryControls } from "../../features/data-transfer";
import { Brand } from "./Brand";

export function AppLoadingScreen() {
  const { loadError, reload } = useFinanceStatus();
  const security = useSecurity();
  return (
    <SafeAreaView style={st.loading}>
      {security.locked && <LockScreen />}
      <View
        style={{
          display: security.locked ? "none" : "flex",
          alignItems: "center",
        }}
        importantForAccessibility={
          security.locked ? "no-hide-descendants" : "auto"
        }
      >
        <Brand />
        <View style={{ height: 24 }} />
        {loadError ? (
          <>
            <Txt style={{ textAlign: "center", lineHeight: 22, maxWidth: 340 }}>
              {loadError}
            </Txt>
            <Button
              label="Повторить загрузку"
              onPress={reload}
              style={{ marginTop: 22 }}
            />
            <RecoveryControls />
          </>
        ) : (
          <ActivityIndicator color={C.green} />
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
