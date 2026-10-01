import { useCallback, useRef, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useFinanceStatus } from "../../state/finance";
import { C, TourProvider, TourScrollProvider } from "../../shared/ui";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSecurity, LockScreen } from "../../features/security";
import { useAppNavigation } from "../navigation/useAppNavigation";
import { useLearningTour } from "../navigation/useLearningTour";
import type { SheetState } from "../navigation/types";
import { AppLoadingScreen } from "./AppLoadingScreen";
import { AppSheet } from "./AppSheet";
import { SidebarNavigation } from "../navigation/SidebarNavigation";
import { AppHeader } from "./AppHeader";
import { AppStatusBanners } from "./AppStatusBanners";
import { ActiveScreen } from "./ActiveScreen";
import { BottomNavigation } from "../navigation/BottomNavigation";
import { AppToast } from "./AppToast";
import { WelcomeBanner, TourCoach } from "../../features/settings";
import { FirstRunScreen } from "./FirstRunScreen";

export function AppShell() {
  const { ready, needsIntroduction } = useFinanceStatus();
  const security = useSecurity();
  const navigation = useAppNavigation();
  const { tab, sheet, scroll, navigate, back, returnToGuide } = navigation;
  const tour = useLearningTour(navigation);
  const open = useCallback(
    (value: SheetState) => {
      if (value.type === "guide" && value.journey) void tour.start();
      else navigation.open(value);
    },
    [navigation.open, tour.start],
  );
  const content = useRef<View>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const reveal = useCallback(
    (target: View) => {
      target.measureInWindow((_x, targetY, _width, targetHeight) => {
        if (!targetHeight) return;
        scroll.current
          ?.getNativeScrollRef()
          ?.measureInWindow((_sx, viewportY, _sw, viewportHeight) => {
            if (
              !viewportHeight ||
              (targetY >= viewportY &&
                targetY + targetHeight <= viewportY + viewportHeight)
            )
              return;
            if (!content.current) return;
            target.measureLayout(content.current, (_left, top) => {
              scroll.current?.scrollTo({
                y: Math.max(0, top + (wide ? 28 : 25) - 12),
                animated: false,
              });
            });
          });
      });
    },
    [scroll, wide],
  );
  const coach = tour.visible ? (
    <TourCoach
      step={tour.step}
      index={tour.index}
      total={tour.total}
      busy={tour.busy}
      error={tour.error}
      onBack={tour.previous}
      onSkip={tour.skip}
      onPause={tour.pause}
    />
  ) : undefined;
  const [hidden, setHidden] = useState(false);
  if (needsIntroduction)
    return (
      <FirstRunScreen
        onSetup={() => open({ type: "onboarding", startWithAccounts: true })}
        onLearn={() => void tour.start()}
      />
    );
  if (!ready) return <AppLoadingScreen />;

  return (
    <TourProvider target={tour.target} onAction={tour.onAction}>
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
            {coach && !sheet && (
              <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                {coach}
              </View>
            )}
            <AppStatusBanners open={open} />
            <ScrollView
              ref={scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                st.content,
                wide && {
                  paddingHorizontal: 38,
                  paddingTop: 28,
                  maxWidth: 1220,
                },
              ]}
            >
              <TourScrollProvider reveal={reveal}>
                <View ref={content} collapsable={false}>
                  {!tour.active && <WelcomeBanner open={open} />}
                  <ActiveScreen
                    tab={tab}
                    open={open}
                    navigate={navigate}
                    hidden={hidden}
                    planSection={tour.active ? tour.step.section : undefined}
                  />
                </View>
              </TourScrollProvider>
            </ScrollView>
            {!wide && (
              <BottomNavigation tab={tab} navigate={navigate} open={open} />
            )}
          </View>
          {!sheet && <AppToast wide={wide} />}
        </View>
        {security.locked && !sheet && <LockScreen />}
        <AppSheet
          sheet={sheet}
          close={tour.closeSheet}
          open={open}
          back={tour.active || back ? tour.backSheet : undefined}
          returnToGuide={returnToGuide}
          tourCoach={sheet ? coach : undefined}
          startTour={(id) => void tour.start(id)}
        />
      </SafeAreaView>
    </TourProvider>
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
