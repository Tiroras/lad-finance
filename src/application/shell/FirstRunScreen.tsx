import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FirstRunFlow } from "../../features/settings";
import { LockScreen, useSecurity } from "../../features/security";
import { C } from "../../shared/ui";
import { Brand } from "./Brand";

export function FirstRunScreen({ onLearn }: { onLearn: () => void }) {
  const { locked } = useSecurity();
  return (
    <SafeAreaView style={st.screen}>
      <StatusBar style="dark" />
      <View
        style={[st.content, locked && { display: "none" }]}
        importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
        aria-hidden={locked}
      >
        <FirstRunFlow brand={<Brand />} onLearn={onLearn} active={!locked} />
      </View>
      {locked && <LockScreen />}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
});
