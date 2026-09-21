import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollView, Platform, BackHandler, Keyboard } from "react-native";
import { useFinance } from "../../state/finance";
import { observePaymentNotifications } from "../../infrastructure/notifications/notifications";
import { useSecurity } from "../../features/security";
import type { Tab, SheetState } from "./types";

export function useAppNavigation() {
  const { state, ready } = useFinance();
  const { locked } = useSecurity();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const scroll = useRef<ScrollView>(null);
  const navigate = useCallback((value: Tab) => {
    setTab(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const open = useCallback((value: SheetState) => setSheet(value), []);
  const close = useCallback(() => setSheet(null), []);
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);
  useEffect(() => {
    if (!ready) return;
    return observePaymentNotifications(({ paymentId, date }) => {
      navigate("plan");
      if (
        paymentId &&
        date &&
        stateRef.current.recurring.some((p) => p.id === paymentId)
      )
        open({ type: "payment", id: paymentId, date });
    });
  }, [ready, navigate, open]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (locked) return true;
        if (sheet) {
          close();
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
  }, [tab, sheet, locked, close, navigate]);
  return { tab, sheet, scroll, navigate, open, close };
}
