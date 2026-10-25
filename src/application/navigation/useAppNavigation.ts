import { useState, useEffect, useRef, useCallback } from "react";
import {
  Platform,
  BackHandler,
  Keyboard,
  type ScrollViewInstance,
} from "react-native";
import { useFinance, useFinanceStatus } from "../../state/finance";
import { observePaymentNotifications } from "../../infrastructure/notifications/notifications";
import { useSecurity } from "../../features/security";
import type { Tab, SheetState } from "./types";
import {
  openSheet,
  previousSheet,
  returnToLearning,
  type SheetNavigation,
} from "./sheets";
import { notificationTarget } from "./notificationTarget";
import { createDismissalController } from "../../shared/lib/dismissal";

export function useAppNavigation() {
  const [dismissal] = useState(createDismissalController);
  const { state, profile } = useFinance();
  const previousProfile = useRef(profile);
  const { ready, switching } = useFinanceStatus();
  const { locked } = useSecurity();
  const currentRef = useRef({ state, profile, switching });
  currentRef.current = { state, profile, switching };
  const [tab, setTab] = useState<Tab>("home");
  const [sheets, setSheets] = useState<SheetNavigation>({
    current: null,
    parents: [],
  });
  const sheet = sheets.current;
  const scroll = useRef<ScrollViewInstance>(null);
  const backOverride = useRef<(() => boolean) | null>(null);
  const setBackOverride = useCallback((handler: (() => boolean) | null) => {
    backOverride.current = handler;
  }, []);
  const navigate = useCallback((value: Tab) => {
    setTab(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const open = useCallback(
    (value: SheetState) => setSheets((current) => openSheet(current, value)),
    [],
  );
  const close = useCallback(
    () => setSheets({ current: null, parents: [] }),
    [],
  );
  const restoreLocation = useCallback(
    (value: Tab, route: readonly SheetState[]) => {
      setTab(value);
      setSheets({ current: route.at(-1) ?? null, parents: route.slice(0, -1) });
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [],
  );
  const back = useCallback(() => setSheets(previousSheet), []);
  const finishLearningForm = useCallback(() => setSheets(returnToLearning), []);
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);
  useEffect(() => {
    const continueSetup =
      previousProfile.current === "demo" && profile === "personal";
    previousProfile.current = profile;
    navigate("home");
    Keyboard.dismiss();
    // The setup wizard intentionally continues after opening the personal profile.
    setSheets((current) =>
      continueSetup && current.current?.type === "onboarding"
        ? current
        : { current: null, parents: [] },
    );
  }, [profile, navigate]);
  useEffect(() => {
    if (!ready || switching) return;
    return observePaymentNotifications((notification) => {
      const current = currentRef.current;
      if (current.switching) return;
      const target = notificationTarget(
        notification,
        current.profile,
        current.state,
      );
      if (!target) return;
      dismissal.request(() => {
        // A confirmation can outlive a profile switch or a plan update.
        const latest = currentRef.current;
        if (latest.switching) return;
        const destination = notificationTarget(
          notification,
          latest.profile,
          latest.state,
        );
        if (!destination) return;
        navigate(destination.tab);
        if (destination.sheet) open(destination.sheet);
        else close();
      });
    });
  }, [ready, switching, navigate, open, close, dismissal]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (locked) return true;
        if (backOverride.current) {
          dismissal.request(() => backOverride.current?.());
          return true;
        }
        if (sheet) {
          dismissal.request(back);
          return true;
        }
        if (tab !== "home") {
          navigate("home");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [tab, sheet, locked, back, navigate, dismissal]);
  return {
    dismissal,
    tab,
    sheet,
    sheets,
    scroll,
    navigate,
    open,
    close,
    restoreLocation,
    setBackOverride,
    back: sheets.parents.length ? back : undefined,
    returnToGuide: sheets.parents.some((parent) => parent.type === "guide")
      ? finishLearningForm
      : undefined,
  };
}
