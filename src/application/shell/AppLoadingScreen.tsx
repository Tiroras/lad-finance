import { useState } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useFinance, useFinanceStatus } from "../../state/finance";
import {
  decodeProfileRegistry,
  type FinanceProfile,
} from "../../domain/profiles";
import { C, Txt, Button, ErrorText, font } from "../../shared/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSecurity, LockScreen } from "../../features/security";
import {
  RecoveryControls,
  ProfileRecovery,
  BackupNewProfile,
  ImportResults,
} from "../../features/data-transfer";
import { Brand } from "./Brand";

export function AppLoadingScreen({
  pending,
}: {
  pending?: { error: string; retry: () => void };
}) {
  const { profile, profiles, activeProfile } = useFinance();
  const {
    loadError: financeError,
    reload,
    canRecover: financeCanRecover,
    switchProfile,
    switching,
    catalogRecovery,
    pendingRecovery,
    pendingImportId,
  } = useFinanceStatus();
  const loadError = pending?.error ?? financeError;
  const canRecover = !pending && financeCanRecover;
  const [switchError, setSwitchError] = useState("");
  const security = useSecurity();
  const pendingImportName =
    pendingRecovery?.kind === "import"
      ? decodeProfileRegistry(pendingRecovery.candidateRegistryRaw).find(
          (p) => p.id === pendingRecovery.targetId,
        )?.name
      : undefined;
  const openProfile = async (target: FinanceProfile) => {
    setSwitchError("");
    try {
      await switchProfile(target);
    } catch (failure) {
      setSwitchError(
        failure instanceof Error
          ? failure.message
          : "Не удалось открыть профиль. Попробуйте ещё раз.",
      );
    }
  };
  return (
    <SafeAreaView style={st.loading}>
      {security.locked && <LockScreen />}
      <ScrollView
        contentContainerStyle={st.content}
        keyboardShouldPersistTaps="handled"
        style={{
          display: security.locked ? "none" : "flex",
          width: "100%",
        }}
        importantForAccessibility={
          security.locked ? "no-hide-descendants" : "auto"
        }
      >
        <Brand />
        <View style={{ height: 24 }} />
        {pendingImportId ? (
          <View style={{ gap: 16, width: "100%", maxWidth: 520 }}>
            <ImportResults id={pendingImportId} />
          </View>
        ) : loadError ? (
          <>
            {canRecover && (
              <Txt
                style={{
                  fontFamily: font.semibold,
                  textAlign: "center",
                  marginBottom: 12,
                  maxWidth: 340,
                }}
              >
                Профиль: {activeProfile.name}
              </Txt>
            )}
            <Txt style={{ textAlign: "center", lineHeight: 22, maxWidth: 340 }}>
              {loadError}
            </Txt>
            <Button
              label="Повторить загрузку"
              onPress={() => {
                setSwitchError("");
                if (pending) pending.retry();
                else reload();
              }}
              disabled={switching}
              style={{ marginTop: 22 }}
            />
            {!pending && catalogRecovery && (
              <ProfileRecovery
                importControls={
                  <BackupNewProfile defaultName={pendingImportName} />
                }
              />
            )}
            {canRecover && (
              <>
                <RecoveryControls key={profile} target={activeProfile} />
                {profiles.length > 1 && (
                  <View
                    style={{
                      gap: 12,
                      marginTop: 24,
                      maxWidth: 380,
                      width: "100%",
                    }}
                  >
                    <Txt style={{ fontFamily: font.semibold }}>
                      Можно открыть другой профиль
                    </Txt>
                    {profiles
                      .filter((item) => item.id !== profile)
                      .map((item) => (
                        <Button
                          key={item.id}
                          label={`Открыть ${item.name}`}
                          accessibilityLabel={`Открыть профиль: ${item.name}`}
                          variant="secondary"
                          disabled={switching}
                          onPress={() => void openProfile(item.id)}
                        />
                      ))}
                  </View>
                )}
                <ErrorText error={switchError} />
              </>
            )}
          </>
        ) : (
          <ActivityIndicator color={C.green} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
