import {
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  Animated,
  Platform,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
  type ViewInstance,
} from "react-native";
import { TourContext, TourFrameContext, type TourAnchor } from "./TourContext";
import { TourShade } from "./TourShade";

export interface TourFrameHandle {
  reveal: () => void;
}

/** One presentation surface, including native Modal content, owns its coach and spotlight. */
export function TourFrame({
  ref,
  coach,
  children,
  style,
  extendShade = false,
  scrollKey,
}: {
  ref?: Ref<TourFrameHandle>;
  coach?: ReactNode;
  children: (presentation: {
    coach: ReactNode;
    onScroll: NonNullable<ScrollViewProps["onScroll"]>;
    onLayout: () => void;
  }) => ReactNode;
  style?: StyleProp<ViewStyle>;
  extendShade?: boolean;
  scrollKey?: string;
}) {
  const { target } = useContext(TourContext);
  const frameRef = useRef<ViewInstance>(null);
  const coachRef = useRef<ViewInstance>(null);
  const refreshRef = useRef<(immediate?: boolean) => void>(() => undefined);
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: Platform.OS !== "web",
      }),
    [scrollY],
  );
  useLayoutEffect(() => {
    // A keyed sheet ScrollView starts at zero; the main ScrollView keeps its offset.
    scrollY.setValue(0);
  }, [scrollKey, scrollY]);
  const [anchor, setAnchor] = useState<TourAnchor | null>(null);
  const currentAnchor = useRef<TourAnchor | null>(null);
  currentAnchor.current = anchor?.id === target ? anchor : null;
  const reveal = useCallback(() => {
    const current = currentAnchor.current;
    current?.reveal?.(current.node);
    refreshRef.current(true);
  }, []);
  useImperativeHandle(ref, () => ({ reveal }), [reveal]);
  useLayoutEffect(() => {
    // Ancestor host refs attach after child layout effects. Reveal and measure
    // here, once the frame and its ScrollView/content refs are all available.
    reveal();
  }, [anchor, target, scrollKey, reveal]);
  const register = useCallback((next: TourAnchor) => {
    setAnchor(next);
    return () => setAnchor((current) => (current === next ? null : current));
  }, []);
  // Host layout is already available in onLayout. In particular a Modal can
  // report its final size after our initial layout effect; do not postpone the
  // correction to another animation frame. Scrolling never calls this path.
  const refresh = useCallback(() => refreshRef.current(true), []);
  const context = useMemo(
    () => ({ register, refresh, reveal }),
    [register, refresh, reveal],
  );
  const renderedCoach = useMemo(
    () =>
      coach ? (
        <View
          ref={coachRef}
          collapsable={false}
          onLayout={refresh}
          style={{ alignSelf: "center", width: "100%", maxWidth: 680 }}
        >
          {coach}
        </View>
      ) : null,
    [coach, refresh],
  );
  // Registering a target updates only the shade, not the underlying screen tree.
  const content = useMemo(
    () => children({ coach: renderedCoach, onScroll, onLayout: refresh }),
    [children, renderedCoach, onScroll, refresh],
  );
  return (
    <TourFrameContext value={context}>
      <View
        ref={frameRef}
        collapsable={false}
        onLayout={refresh}
        style={[{ flex: 1 }, style]}
      >
        {content}
        {!!coach && (
          <TourShade
            target={target}
            anchor={anchor?.id === target ? anchor : null}
            frameRef={frameRef}
            coachRef={coachRef}
            refreshRef={refreshRef}
            scrollY={scrollY}
            extendShade={extendShade}
          />
        )}
      </View>
    </TourFrameContext>
  );
}
