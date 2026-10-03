import { StyleSheet, View } from "react-native";
import {
  intersectTourRects,
  tourDimPanels,
  type TourRect,
} from "./tourGeometry";
export const TOUR_DIM_COLOR = "rgba(9, 22, 17, 0.68)";

/** Only the small corner squares need clipping; there is no full-screen mask. */
export function TourHoleCorners({
  hole,
  radius,
}: {
  hole: TourRect;
  radius: number;
}) {
  const size = Math.min(radius, hole.width / 2, hole.height / 2);
  if (size <= 0) return null;
  return [0, 1, 2, 3].map((corner) => {
    const right = corner % 2 === 1;
    const bottom = corner >= 2;
    return (
      <View
        key={corner}
        style={{
          position: "absolute",
          overflow: "hidden",
          left: hole.x + (right ? hole.width - size : 0),
          top: hole.y + (bottom ? hole.height - size : 0),
          width: size,
          height: size,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: (right ? -2 : -1) * size,
            top: (bottom ? -2 : -1) * size,
            width: size * 4,
            height: size * 4,
            borderRadius: size * 2,
            borderWidth: size,
            borderColor: TOUR_DIM_COLOR,
          }}
        />
      </View>
    );
  });
}

/** Static fills outside the coach and either a fixed target or a scrolling viewport. */
export function TourCurtain({
  frame,
  coach,
  spotlight,
  spotlightRadius = 14,
}: {
  frame: TourRect;
  coach: TourRect;
  spotlight: TourRect | null;
  spotlightRadius?: number;
}) {
  const holes = [coach, ...(spotlight ? [spotlight] : [])];
  const panels = tourDimPanels(
    { x: 0, y: 0, width: frame.width, height: frame.height },
    holes,
  );
  return (
    <>
      {panels.map((panel, index) => (
        <View
          key={index}
          style={[
            styles.panel,
            {
              left: panel.x,
              top: panel.y,
              width: panel.width,
              height: panel.height,
            },
          ]}
        />
      ))}
      {holes.map((hole, index) => {
        if (
          holes.some(
            (other, otherIndex) =>
              otherIndex !== index && intersectTourRects(hole, other),
          )
        )
          return null;
        return (
          <TourHoleCorners
            key={index}
            hole={hole}
            radius={index === 0 ? 16 : spotlightRadius}
          />
        );
      })}
    </>
  );
}
const styles = StyleSheet.create({
  panel: { position: "absolute", backgroundColor: TOUR_DIM_COLOR },
});
