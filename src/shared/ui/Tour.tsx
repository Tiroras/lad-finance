import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSheetReveal } from "./SheetScroll";
import { C } from "./theme";

const Context = createContext<{
  target: string | null;
  onAction: (id: string) => void;
}>({ target: null, onAction: () => undefined });
const ScrollContext = createContext<((target: View) => void) | undefined>(
  undefined,
);

export function TourProvider({
  target,
  onAction,
  children,
}: {
  target: string | null;
  onAction: (id: string) => void;
  children: ReactNode;
}) {
  return <Context value={{ target, onAction }}>{children}</Context>;
}

export function TourScrollProvider({
  reveal,
  children,
}: {
  reveal: (target: View) => void;
  children: ReactNode;
}) {
  return <ScrollContext value={reveal}>{children}</ScrollContext>;
}

export function useTourAction() {
  return useContext(Context).onAction;
}

export function TourTarget({
  id,
  children,
  style,
}: {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { target } = useContext(Context);
  const active = target === id;
  const ref = useRef<View>(null);
  const sheetReveal = useSheetReveal();
  const pageReveal = useContext(ScrollContext);
  const reveal = sheetReveal ?? pageReveal;
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      if (ref.current) reveal?.(ref.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, reveal, width, height]);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      testID={active ? `tour-target-${id}` : undefined}
      onLayout={() => {
        if (active && ref.current) reveal?.(ref.current);
      }}
    >
      {children}
      {active && <View pointerEvents="none" style={styles.focus} />}
    </View>
  );
}
const styles = StyleSheet.create({
  focus: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderColor: C.lime,
    borderWidth: 3,
    borderRadius: 14,
    boxShadow: "0 0 0 2px #234B3C",
    backgroundColor: "rgba(213,233,167,0.12)",
  },
});
