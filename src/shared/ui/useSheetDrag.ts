import { useLayoutEffect, useMemo, useRef } from "react";
import { Animated, Keyboard, PanResponder, Platform } from "react-native";

const useNativeDriver = Platform.OS !== "web";

export function useSheetDrag({
  visible,
  blocked,
  contentKey,
  height,
  onClose,
}: {
  visible: boolean;
  blocked: boolean;
  contentKey?: string;
  height: number;
  onClose: () => void | boolean;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const current = useRef({ enabled: visible && !blocked, height, onClose });
  const dragging = useRef(false);
  const moving = useRef(false);
  const dismissing = useRef(false);
  const origin = useRef(0);

  useLayoutEffect(() => {
    current.current = { enabled: visible && !blocked, height, onClose };
  }, [visible, blocked, height, onClose]);

  useLayoutEffect(() => {
    dragging.current = false;
    moving.current = false;
    dismissing.current = false;
    translateY.stopAnimation();
    // Keep a dismissed sheet offscreen during the Modal's closing fade.
    // Reset before reopening, changing forms or covering a draft with the lock.
    if (visible) translateY.setValue(0);
    return () => {
      dragging.current = false;
      translateY.stopAnimation();
    };
  }, [visible, blocked, contentKey, height, translateY]);

  const responder = useMemo(() => {
    const restore = () => {
      dragging.current = false;
      moving.current = false;
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 300,
        damping: 30,
        mass: 1,
        overshootClamping: true,
        useNativeDriver,
      }).start();
    };

    return PanResponder.create({
      // Native Modal claims unhandled touch starts. Waiting until a move would
      // leave the header outside subsequent responder negotiation. Claim starts
      // in the bubble phase so the child Back/Close buttons still get taps first.
      onStartShouldSetPanResponder: (_, gesture) =>
        current.current.enabled &&
        !dismissing.current &&
        gesture.numberActiveTouches === 1,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        current.current.enabled &&
        !dismissing.current &&
        gesture.numberActiveTouches === 1 &&
        gesture.dy > 8 &&
        gesture.dy > Math.abs(gesture.dx) * 1.2,
      onPanResponderGrant: () => {
        dragging.current = true;
        moving.current = false;
        origin.current = 0;
        translateY.stopAnimation((value) => {
          if (dragging.current) origin.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        if (!dragging.current || !current.current.enabled) return;
        if (gesture.numberActiveTouches !== 1) {
          restore();
          return;
        }
        // Owning the touch does not yet make it a drag: ignore taps, upward
        // swipes and horizontal movement until a downward intent is clear.
        if (!moving.current) {
          if (gesture.dy <= 8 || gesture.dy <= Math.abs(gesture.dx) * 1.2)
            return;
          moving.current = true;
        }
        translateY.setValue(Math.max(0, origin.current + gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (!dragging.current || !current.current.enabled) return;
        dragging.current = false;
        const distance = Math.max(0, origin.current + gesture.dy);
        if (
          !moving.current ||
          (distance < 100 && !(distance > 28 && gesture.vy > 0.65))
        ) {
          restore();
          return;
        }
        dismissing.current = true;
        Animated.timing(translateY, {
          toValue: current.current.height,
          duration: 180,
          useNativeDriver,
        }).start(({ finished }) => {
          if (finished && current.current.enabled) {
            Keyboard.dismiss();
            if (current.current.onClose() === false) {
              dismissing.current = false;
              // A confirmation has replaced the form. Do not start another
              // native animation while React hides its original touch surface.
              moving.current = false;
              translateY.stopAnimation();
              translateY.setValue(0);
            }
          }
        });
      },
      onPanResponderTerminate: restore,
      onPanResponderTerminationRequest: () => true,
    });
  }, [translateY]);

  return { translateY, panHandlers: responder.panHandlers };
}
