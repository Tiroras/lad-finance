import { View, StyleSheet, ActivityIndicator } from "react-native";
import { C } from "../shared/ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { AppProviders } from "./providers/AppProviders";
import { AppShell } from "./shell/AppShell";

export default function App() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  return (
    <SafeAreaProvider>
      {!loaded && !error ? (
        <View style={st.loading}>
          <ActivityIndicator color={C.green} />
        </View>
      ) : (
        <AppProviders>
          <AppShell />
        </AppProviders>
      )}
    </SafeAreaProvider>
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
