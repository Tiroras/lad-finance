import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
  type ViewInstance,
} from "react-native";
import { canStartOnboarding } from "../../../domain/onboarding";
import { useFinance, useFinanceStatus } from "../../../state/finance";
import { C, font, FormFields, Txt } from "../../../shared/ui";
import { useLearningProgress } from "../model/useLearningProgress";
import { tourSteps } from "../lib/tourSteps";
import { FirstRunWelcome } from "./FirstRunWelcome";
import { OnboardingFlow } from "./OnboardingFlow";
import { FirstRunLearningOffer } from "./FirstRunLearningOffer";

export function FirstRunFlow({
  brand,
  onLearn,
  active,
}: {
  brand: ReactNode;
  onLearn: () => void;
  active: boolean;
}) {
  const { state } = useFinance();
  const { needsIntroduction, finishIntroduction } = useFinanceStatus();
  const [welcome, setWelcome] = useState(needsIntroduction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const learning = useLearningProgress();
  const saving = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const content = useRef<ViewInstance>(null);
  const offer = !needsIntroduction && !canStartOnboarding(state);
  const showWelcome = welcome && !offer;
  const run = async (action: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить изменения. Попробуйте ещё раз.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const startSetup = () =>
    run(async () => {
      if (needsIntroduction) {
        // Save the route before creating the profile so a reload cannot skip
        // setup. This metadata never stores financial fields or form drafts.
        await learning.update((value) => ({
          ...value,
          status: "new",
          step: tourSteps[0].id,
          firstRun: "setup",
        }));
        await finishIntroduction();
      }
      setWelcome(false);
    });
  useEffect(() => {
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: false });
    setError("");
  }, [showWelcome, offer]);
  useEffect(() => {
    // Setup handles Back between its steps; do not exit first launch while
    // an explicit choice or an in-flight write is still pending.
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => !active || busy || offer,
    );
    return () => subscription.remove();
  }, [active, busy, offer]);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.screen}
    >
      <FormFields
        disabled={!active || busy || showWelcome || offer}
        scrollRef={scroll}
        contentRef={content}
      >
        {(onViewportLayout) => (
          <ScrollView
            ref={scroll}
            style={styles.screen}
            onLayout={onViewportLayout}
            contentContainerStyle={[
              styles.scrollContent,
              (showWelcome || offer) && { justifyContent: "center" },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View ref={content} collapsable={false} style={styles.column}>
              {showWelcome && (
                <FirstRunWelcome
                  brand={brand}
                  busy={busy}
                  error={error}
                  onStart={() => void startSetup()}
                />
              )}
              {!needsIntroduction && !offer && (
                <View
                  style={[styles.setup, showWelcome && { display: "none" }]}
                  aria-hidden={showWelcome}
                  importantForAccessibility={
                    showWelcome ? "no-hide-descendants" : "auto"
                  }
                  testID="first-run-setup"
                >
                  <Txt accessibilityRole="header" style={styles.title}>
                    Начнём ваш учёт
                  </Txt>
                  <OnboardingFlow
                    startWithAccounts
                    active={active && !showWelcome}
                    close={() => undefined}
                    onBack={() => setWelcome(true)}
                    onStepChange={() => {
                      Keyboard.dismiss();
                      scroll.current?.scrollTo({ y: 0, animated: false });
                    }}
                  />
                </View>
              )}
              {offer && (
                <FirstRunLearningOffer brand={brand} onLearn={onLearn} />
              )}
            </View>
          </ScrollView>
        )}
      </FormFields>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: "100%", backgroundColor: C.bg },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 30,
  },
  column: { width: "100%", maxWidth: 480, gap: 20 },
  setup: { gap: 20 },
  title: {
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 37,
    textAlign: "center",
  },
  description: { color: C.muted, lineHeight: 23, textAlign: "center" },
});
