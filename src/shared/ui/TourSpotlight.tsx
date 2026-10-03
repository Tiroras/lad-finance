import { useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { TOUR_DIM_COLOR, TourHoleCorners } from "./TourCurtain";
import type { TourRect } from "./tourGeometry";
import { C } from "./theme";

export function TourSpotlight({ rect }: { rect: TourRect }) {
  return (
    <View
      testID="tour-spotlight"
      style={[
        styles.outline,
        { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
      ]}
    >
      <View style={styles.innerBorder} />
    </View>
  );
}

/** The native scroll offset moves both edges and the outline in the same UI frame. */
export function TourScrollingSpotlight({
  viewport,
  spotlight,
  scrollY,
}: {
  viewport: TourRect;
  spotlight: TourRect;
  scrollY: Animated.Value;
}) {
  const { width, height } = viewport;
  const motion = useMemo(
    () => ({
      top: scrollY.interpolate({
        inputRange: [spotlight.y - height, spotlight.y],
        outputRange: [height, 0],
        extrapolate: "clamp",
      }),
      bottom: scrollY.interpolate({
        inputRange: [
          spotlight.y + spotlight.height - height,
          spotlight.y + spotlight.height,
        ],
        outputRange: [height, 0],
        extrapolate: "clamp",
      }),
      target: Animated.multiply(scrollY, -1),
    }),
    [height, spotlight.y, spotlight.height, scrollY],
  );
  const localHole = {
    x: 0,
    y: 0,
    width: spotlight.width,
    height: spotlight.height,
  };
  return (
    <View
      style={{
        position: "absolute",
        overflow: "hidden",
        left: viewport.x,
        top: viewport.y,
        width,
        height,
      }}
    >
      <View
        style={[styles.panel, { left: 0, top: 0, width: spotlight.x, height }]}
      />
      <View
        style={[
          styles.panel,
          {
            left: spotlight.x + spotlight.width,
            top: 0,
            width: Math.max(0, width - spotlight.x - spotlight.width),
            height,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.panel,
          {
            left: spotlight.x,
            top: -height,
            width: spotlight.width,
            height,
            transform: [{ translateY: motion.top }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.panel,
          {
            left: spotlight.x,
            top: 0,
            width: spotlight.width,
            height,
            transform: [{ translateY: motion.bottom }],
          },
        ]}
      />
      <Animated.View
        style={{
          position: "absolute",
          left: spotlight.x,
          top: spotlight.y,
          width: spotlight.width,
          height: spotlight.height,
          transform: [{ translateY: motion.target }],
        }}
      >
        <TourHoleCorners hole={localHole} radius={14} />
        <TourSpotlight rect={localHole} />
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { position: "absolute", backgroundColor: TOUR_DIM_COLOR },
  outline: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
  },
  innerBorder: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderRadius: 12,
    borderColor: C.lime,
  },
});
