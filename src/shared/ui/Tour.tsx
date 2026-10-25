import {
  createContext,
  useContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type ViewInstance,
} from "react-native";
import { useSheetTourScroll } from "./SheetScroll";
import {
  TourContext,
  TourFrameContext,
  type TourScrollScope,
} from "./TourContext";

const ScrollContext = createContext<
  | (TourScrollScope & {
      reveal: (target: ViewInstance) => void;
    })
  | undefined
>(undefined);

export function TourProvider({
  active,
  target,
  onAction,
  children,
}: {
  active: boolean;
  target: string | null;
  onAction: (id: string) => void;
  children: ReactNode;
}) {
  const context = useMemo(
    () => ({ active, target, onAction }),
    [active, target, onAction],
  );
  return <TourContext value={context}>{children}</TourContext>;
}

export function TourScrollProvider({
  reveal,
  scrollRef,
  contentRef,
  contentInsetTop,
  children,
}: {
  reveal: (target: ViewInstance) => void;
  children: ReactNode;
} & TourScrollScope) {
  const context = useMemo(
    () => ({ reveal, scrollRef, contentRef, contentInsetTop }),
    [reveal, scrollRef, contentRef, contentInsetTop],
  );
  return <ScrollContext value={context}>{children}</ScrollContext>;
}

export function useTourAction() {
  return useContext(TourContext).onAction;
}

export function useTourActive() {
  return useContext(TourContext).active;
}

/** Reveal a collapsed section while the tour points to one of its controls. */
export function useTourTargetActive(id: string) {
  const { active, target } = useContext(TourContext);
  return active && target === id;
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
  const { target } = useContext(TourContext);
  const frame = useContext(TourFrameContext);
  const active = target === id;
  const ref = useRef<ViewInstance>(null);
  const sheetScroll = useSheetTourScroll();
  const pageScroll = useContext(ScrollContext);
  const scope = sheetScroll ?? pageScroll;
  const reveal = scope?.reveal;
  const scrollRef = scope?.scrollRef;
  const contentRef = scope?.contentRef;
  const insetTop = scope?.contentInsetTop ?? 0;
  const { width, height } = useWindowDimensions();
  useLayoutEffect(() => {
    if (!active || !ref.current || !frame) return;
    const unregister = frame.register({
      id,
      node: ref.current,
      scroll:
        scrollRef && contentRef
          ? { scrollRef, contentRef, contentInsetTop: insetTop }
          : undefined,
      reveal,
    });
    return unregister;
  }, [
    active,
    frame,
    id,
    scrollRef,
    contentRef,
    insetTop,
    reveal,
    width,
    height,
  ]);
  const revealOnLayout = useCallback(() => {
    if (!active) return;
    if (ref.current) reveal?.(ref.current);
    frame?.refresh();
  }, [active, reveal, frame]);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      testID={active ? `tour-target-${id}` : undefined}
      onLayout={revealOnLayout}
    >
      {children}
    </View>
  );
}
