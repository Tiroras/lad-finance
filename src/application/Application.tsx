import { useCallback, useEffect, useState } from "react";
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
import { resetDevelopmentData } from "../infrastructure/storage/developmentReset";
import type { DataDeletionRequest } from "../domain/profiles";
import { appDataDeletion } from "../infrastructure/storage/appDataDeletion";
import { clearLedgerStorageCache } from "../infrastructure/storage/ledgerStorage";
import { settleStoredDrafts } from "../infrastructure/storage/useStoredDraft";
import { resetLearningProgressMemory } from "../features/settings";

export default function App() {
  const [startupReady, setStartupReady] = useState(false);
  const [startupError, setStartupError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deletion, setDeletion] = useState<DataDeletionRequest>();
  const deleteData = useCallback((request: DataDeletionRequest) => {
    setStartupReady(false);
    setStartupError(false);
    setDeletion(request);
  }, []);
  useEffect(() => {
    // Fast Refresh can repeat effects while preserving state. Preparation must
    // never run over a mounted session, or replay a previously confirmed reset.
    if (startupReady) return;
    let active = true;
    const prepare = async () => {
      await settleStoredDrafts();
      await resetLearningProgressMemory();
      clearLedgerStorageCache();
      await appDataDeletion.run(deletion);
      await resetDevelopmentData();
    };
    void prepare().then(
      () => {
        if (active) {
          setDeletion(undefined);
          setStartupReady(true);
        }
      },
      () => {
        if (active) setStartupError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, deletion, startupReady]);
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
                Не удалось завершить подготовку или удаление данных. Учёт
                закрыт, чтобы не записать данные поверх незавершённого удаления.
                Повторите попытку.
              </Txt>
              <Button
                label="Повторить попытку"
                onPress={() => {
                  setStartupError(false);
                  setAttempt((value) => value + 1);
                }}
              />
            </>
          ) : (
            <>
              <ActivityIndicator color={C.green} />
              {deletion && <Txt>Удаляем данные…</Txt>}
            </>
          )}
        </View>
      ) : (
        <AppProviders onDeleteData={deleteData}>
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
