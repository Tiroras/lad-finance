import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollView, Platform, BackHandler, Keyboard } from "react-native";
import { useFinance, useFinanceStatus } from "../../state/finance";
import { observePaymentNotifications } from "../../infrastructure/notifications/notifications";
import { useSecurity } from "../../features/security";
import type { Tab, SheetState } from "./types";
import { openSheet, previousSheet, type SheetNavigation } from "./sheets";
import { notificationTarget } from "./notificationTarget";

export function useAppNavigation() {
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
  const scroll = useRef<ScrollView>(null);
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
  const back = useCallback(() => setSheets(previousSheet), []);
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
      navigate(target.tab);
      if (target.sheet) open(target.sheet);
    });
  }, [ready, switching, navigate, open]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (locked) return true;
        if (sheet) {
          back();
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
  }, [tab, sheet, locked, back, navigate]);
  return {
    tab,
    sheet,
    scroll,
    navigate,
    open,
    close,
    back: sheets.parents.length ? back : undefined,
  };
}
