import { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Button, C, Txt } from "../shared/ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { AppProviders } from "./providers/AppProviders";
import { AppShell } from "./shell/AppShell";
import { FRESH_START_ENABLED } from "../shared/lib/buildOptions";
import { resetDevelopmentData } from "../infrastructure/storage/developmentReset";

export default function App() {
  const [startupReady, setStartupReady] = useState(!FRESH_START_ENABLED);
  const [startupError, setStartupError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void resetDevelopmentData().then(
      () => {
        if (active) setStartupReady(true);
      },
      () => {
        if (active) setStartupError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  return (
    <SafeAreaProvider>
      {(!loaded && !error) || !startupReady ? (
        <View style={st.loading}>
          {startupError ? (
            <>
              <Txt style={{ textAlign: "center" }}>
                Не удалось очистить данные приложения. Повторите запуск с нуля.
              </Txt>
              <Button
                label="Повторить очистку"
                onPress={() => {
                  setStartupError(false);
                  setAttempt((value) => value + 1);
                }}
              />
            </>
          ) : (
            <ActivityIndicator color={C.green} />
          )}
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
    gap: 16,
  },
});
