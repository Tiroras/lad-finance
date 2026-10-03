import { useLayoutEffect, useState, type RefObject } from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type Animated,
} from "react-native";
import type { TourAnchor } from "./TourContext";
import { sameTourRect, type TourRect } from "./tourGeometry";
import { measureTourLayout, type TourLayout } from "./tourMeasurement";
import { createTourMeasurementQueue } from "./tourMeasurementQueue";
import { TourCurtain } from "./TourCurtain";
import { TourScrollingSpotlight, TourSpotlight } from "./TourSpotlight";

interface Measurements extends TourLayout {
  anchor: TourAnchor | null;
}

export function TourShade({
  target,
  anchor,
  frameRef,
  coachRef,
  refreshRef,
  scrollY,
  extendShade,
}: {
  target: string | null;
  anchor: TourAnchor | null;
  frameRef: RefObject<View | null>;
  coachRef: RefObject<View | null>;
  refreshRef: RefObject<(immediate?: boolean) => void>;
  scrollY: Animated.Value;
  extendShade: boolean;
}) {
  const [rects, setRects] = useState<Measurements | null>(null);
  const { width, height } = useWindowDimensions();
  useLayoutEffect(() => {
    const queue = createTourMeasurementQueue<Measurements | null>({
      schedule: requestAnimationFrame,
      cancel: cancelAnimationFrame,
      measure() {
        const measured = measureTourLayout(
          frameRef.current,
          coachRef.current,
          anchor,
        );
        const attachAnchor = (layout: TourLayout | null) =>
          layout && { ...layout, anchor };
        return measured instanceof Promise
          ? measured.then(attachAnchor)
          : attachAnchor(measured);
      },
      publish(next) {
        setRects((previous) =>
          previous &&
          next &&
          previous.anchor === next.anchor &&
          sameTourRect(previous.frame, next.frame) &&
          sameTourRect(previous.coach, next.coach) &&
          sameTourRect(previous.spotlight, next.spotlight) &&
          sameTourRect(previous.viewport, next.viewport)
            ? previous
            : next,
        );
      },
      onError: () => setRects(null),
    });
    refreshRef.current = (immediate = false) =>
      immediate ? queue.requestImmediate() : queue.request();
    // On first mount TourFrame's parent layout effect starts the measurement
    // after its host ref attaches. An existing frame can be measured now.
    if (frameRef.current) queue.requestImmediate();
    return () => {
      queue.dispose();
      refreshRef.current = () => undefined;
    };
  }, [anchor, target, frameRef, coachRef, refreshRef, width, height]);

  if (!rects) return null;
  // A sheet and its shade share the same native transform, including dismissal.
  const horizontalInset = extendShade ? width : 0;
  const verticalInset = extendShade ? height * 2 : 0;
  const canvas = {
    x: 0,
    y: 0,
    width: rects.frame.width + horizontalInset * 2,
    height: rects.frame.height + verticalInset * 2,
  };
  const offset = (rect: TourRect): TourRect => ({
    ...rect,
    x: rect.x + horizontalInset,
    y: rect.y + verticalInset,
  });
  // Never display coordinates from another target or a replaced ScrollView.
  const spotlight =
    anchor && rects.anchor === anchor && anchor.id === target
      ? rects.spotlight
      : null;
  const viewport = spotlight && rects.viewport;
  return (
    <View
      testID="tour-overlay"
      pointerEvents="none"
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.overlay,
        {
          top: -verticalInset,
          bottom: -verticalInset,
          left: -horizontalInset,
          right: -horizontalInset,
        },
      ]}
    >
      <TourCurtain
        frame={canvas}
        coach={offset(rects.coach)}
        spotlight={viewport ? offset(viewport) : spotlight && offset(spotlight)}
        spotlightRadius={viewport ? 0 : 14}
      />
      {spotlight &&
        (viewport ? (
          <TourScrollingSpotlight
            viewport={offset(viewport)}
            spotlight={spotlight}
            scrollY={scrollY}
          />
        ) : (
          <TourSpotlight rect={offset(spotlight)} />
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: { position: "absolute", zIndex: 1000 },
});
