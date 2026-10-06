import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "react-native";
import {
  tourSteps,
  tourStepIndex,
  useLearningProgress,
} from "../../features/settings";
import { useSecurity } from "../../features/security";
import { useFinance } from "../../state/finance";
import type { useAppNavigation } from "./useAppNavigation";

const stepLocations = tourSteps.map((step) =>
  JSON.stringify([
    step.tab,
    { current: step.sheets.at(-1) ?? null, parents: step.sheets.slice(0, -1) },
  ]),
);

export function useLearningTour(
  navigation: ReturnType<typeof useAppNavigation>,
) {
  const learning = useLearningProgress();
  const { profile, notify } = useFinance();
  const { locked } = useSecurity();
  const previousProfile = useRef(profile);
  const [active, setActive] = useState(false);
  const [moving, setMoving] = useState(false);
  const pending = useRef(false);
  const session = useRef(0);
  const index = tourStepIndex(learning.progress.step);
  const step = tourSteps[index];
  const action = step.action ?? step.target;
  const {
    restoreLocation,
    setBackOverride,
    close,
    navigate,
    back,
    tab,
    sheets,
    dismissal,
  } = navigation;
  const location = useMemo(() => JSON.stringify([tab, sheets]), [tab, sheets]);
  const currentLocation = useRef({ tab, sheets, location });
  currentLocation.current = { tab, sheets, location };
  const wanted = stepLocations[index];

  useEffect(() => {
    if (previousProfile.current !== profile) {
      previousProfile.current = profile;
      session.current++;
      setActive(false);
    }
  }, [profile]);
  useEffect(() => {
    if (!active || moving || locked || location === wanted) return;
    restoreLocation(step.tab, step.sheets);
  }, [active, moving, locked, location, wanted, step, restoreLocation]);

  const move = useCallback(
    async (next: number) => {
      if (pending.current || locked) return;
      pending.current = true;
      const currentSession = session.current;
      setMoving(true);
      Keyboard.dismiss();
      try {
        await learning.update(() => ({
          version: 2,
          status: next >= tourSteps.length ? "completed" : "started",
          step: tourSteps[Math.min(next, tourSteps.length - 1)].id,
        }));
        if (currentSession !== session.current) return;
        if (next >= tourSteps.length) {
          setActive(false);
          const current = currentLocation.current;
          if (current.sheets.current || current.sheets.parents.length) close();
          if (current.tab !== "home") navigate("home");
          notify(
            "Экскурсия завершена. Повторить её можно в разделе «Обучение».",
          );
        }
      } catch {
        // Keep the saved cursor and reveal the same actual control for retry.
      } finally {
        pending.current = false;
        setMoving(false);
      }
    },
    [learning.update, locked, close, navigate, notify],
  );
  const pause = useCallback(() => {
    session.current++;
    Keyboard.dismiss();
    setActive(false);
  }, []);
  const skipTour = useCallback(async () => {
    if (pending.current || locked) return;
    pending.current = true;
    const currentSession = session.current;
    setMoving(true);
    Keyboard.dismiss();
    try {
      await learning.skip();
      if (currentSession !== session.current) return;
      setActive(false);
      notify("Экскурсия пропущена. Начать её можно в разделе «Обучение».");
    } catch {
      // Keep the tour visible so the storage error can be retried.
    } finally {
      pending.current = false;
      setMoving(false);
    }
  }, [learning.skip, locked, notify]);
  const previous = useCallback(() => {
    dismissal.request(() => {
      if (index > 0) void move(index - 1);
      else pause();
    });
  }, [index, move, pause, dismissal]);
  const onAction = useCallback(
    (id: string) => {
      if (active && !locked && id === action) void move(index + 1);
    },
    [active, locked, action, index, move],
  );
  const start = useCallback(
    async (id?: string) => {
      if (pending.current || locked) return;
      pending.current = true;
      const currentSession = ++session.current;
      setMoving(true);
      try {
        const next = id
          ? tourStepIndex(id)
          : learning.progress.status === "started"
            ? index
            : 0;
        await learning.update(() => ({
          version: 2,
          status: "started",
          step: tourSteps[next].id,
        }));
        if (currentSession !== session.current) return;
        if (currentLocation.current.location !== stepLocations[next])
          restoreLocation(tourSteps[next].tab, tourSteps[next].sheets);
        setActive(true);
      } catch {
        // Launch menu / welcome banner displays the storage error.
      } finally {
        pending.current = false;
        setMoving(false);
      }
    },
    [locked, learning.progress.status, learning.update, index, restoreLocation],
  );
  const closeSheet = useCallback(() => {
    if (!active || action !== "sheet.close") pause();
    close();
    if (active && action === "sheet.close") onAction("sheet.close");
  }, [active, action, pause, close, onAction]);
  const backSheet = useCallback(() => {
    if (!active) {
      pause();
      back?.();
      return;
    }
    if (action === "sheet.back") {
      back?.();
      onAction("sheet.back");
    } else previous();
  }, [active, action, back, previous, onAction, pause]);
  useEffect(() => {
    if (!active && !moving) return;
    setBackOverride(() => {
      if (!locked) {
        if (active) previous();
        else pause();
      }
      return true;
    });
    return () => setBackOverride(null);
  }, [active, moving, locked, previous, pause, setBackOverride]);
  const skip = useCallback(() => {
    dismissal.request(() => void move(index + 1));
  }, [index, move, dismissal]);
  return {
    active,
    visible: active && !locked,
    step,
    index,
    total: tourSteps.length,
    busy: moving || learning.saving,
    error: learning.error,
    target: active && !locked && !moving ? step.target : null,
    start,
    pause,
    skipTour,
    previous,
    onAction,
    closeSheet,
    backSheet,
    skip,
  };
}
