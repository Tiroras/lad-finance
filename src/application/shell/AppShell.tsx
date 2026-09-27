import { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useFinanceStatus } from "../../state/finance";
import { C } from "../../shared/ui";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSecurity, LockScreen } from "../../features/security";
import { useAppNavigation } from "../navigation/useAppNavigation";
import { AppLoadingScreen } from "./AppLoadingScreen";
import { AppSheet } from "./AppSheet";
import { SidebarNavigation } from "../navigation/SidebarNavigation";
import { AppHeader } from "./AppHeader";
import { AppStatusBanners } from "./AppStatusBanners";
import { ActiveScreen } from "./ActiveScreen";
import { BottomNavigation } from "../navigation/BottomNavigation";
import { AppToast } from "./AppToast";
import { WelcomeBanner } from "../../features/settings";
import { FirstRunScreen } from "./FirstRunScreen";

export function AppShell() {
  const { ready, needsIntroduction } = useFinanceStatus();
  const security = useSecurity();
  const { tab, sheet, scroll, navigate, open, close, back } =
    useAppNavigation();
  const [hidden, setHidden] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  if (needsIntroduction)
    return (
      <FirstRunScreen
        onSetup={() => open({ type: "onboarding", startWithAccounts: true })}
      />
    );
  if (!ready) return <AppLoadingScreen />;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={st.safe}>
      <StatusBar style="dark" />
      <View
        style={[st.appFrame, security.locked && { display: "none" }]}
        aria-hidden={!!sheet || security.locked}
        importantForAccessibility={
          sheet || security.locked ? "no-hide-descendants" : "auto"
        }
      >
        {wide && (
          <SidebarNavigation tab={tab} navigate={navigate} open={open} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppHeader
            wide={wide}
            hidden={hidden}
            onToggleBalance={() => setHidden((value) => !value)}
            open={open}
          />
          <AppStatusBanners open={open} />
          <ScrollView
            ref={scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              st.content,
              wide && { paddingHorizontal: 38, paddingTop: 28, maxWidth: 1220 },
            ]}
          >
            <WelcomeBanner open={open} />
            <ActiveScreen
              tab={tab}
              open={open}
              navigate={navigate}
              hidden={hidden}
            />
          </ScrollView>
          {!wide && (
            <BottomNavigation tab={tab} navigate={navigate} open={open} />
          )}
        </View>
        {!sheet && <AppToast wide={wide} />}
      </View>
      {security.locked && !sheet && <LockScreen />}
      <AppSheet sheet={sheet} close={close} open={open} back={back} />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  appFrame: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
  },
  content: {
    width: "100%",
    paddingHorizontal: 21,
    paddingTop: 25,
    paddingBottom: 30,
    alignSelf: "center",
  },
});
