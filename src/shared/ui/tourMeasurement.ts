import {
  PixelRatio,
  Platform,
  type NativeMethods,
  type View,
} from "react-native";
import type { TourAnchor, TourMeasurable } from "./TourContext";
import { tourHole, tourScrollingGeometry, type TourRect } from "./tourGeometry";

export interface TourLayout {
  frame: TourRect;
  coach: TourRect;
  spotlight: TourRect | null;
  viewport: TourRect | null;
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
): TourRect | null {
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  return {
    x: PixelRatio.roundToNearestPixel(x),
    y: PixelRatio.roundToNearestPixel(y),
    width: PixelRatio.roundToNearestPixel(width),
    height: PixelRatio.roundToNearestPixel(height),
  };
}

type Measured = (value: TourRect | null) => void;

function measure(node: TourMeasurable, onMeasured: Measured): void {
  node.measureInWindow((...values) => onMeasured(rect(...values)));
}

function relative(
  node: TourMeasurable | null | undefined,
  parent: Parameters<NativeMethods["measureLayout"]>[0],
  onMeasured: Measured,
): void {
  if (!node) return onMeasured(null);
  node.measureLayout(
    parent,
    (...values) => onMeasured(rect(...values)),
    () => onMeasured(null),
  );
}

/** Measure a stable layout once. Scroll offsets are consumed only by native Animated nodes. */
export function measureTourLayout(
  frameNode: View | null,
  coachNode: View | null,
  anchor: TourAnchor | null,
): TourLayout | null | Promise<TourLayout | null> {
  if (!frameNode || !coachNode) return null;
  const scope = anchor?.scroll;
  const viewportNode = scope?.scrollRef.current?.getNativeScrollRef();
  const contentNode = scope?.contentRef.current;
  const scroll =
    viewportNode && contentNode
      ? {
          viewport: viewportNode,
          content: contentNode,
          insetTop: scope!.contentInsetTop,
        }
      : undefined;
  const webContent = Platform.OS === "web" && scroll;
  const values: LayoutMeasurements = {
    frameMeasurement: null,
    coach: null,
    element: null,
    viewport: null,
    content: null,
  };
  let remaining = 5;
  let result: TourLayout | null | undefined;
  let complete: (layout: TourLayout | null) => void = () => undefined;
  const receive =
    (key: keyof LayoutMeasurements): Measured =>
    (value) => {
      values[key] = value;
      if (--remaining === 0) {
        result = layoutFromMeasurements(
          values,
          !!scroll,
          !!webContent,
          scroll?.insetTop ?? 0,
        );
        complete(result);
      }
    };
  // Never treat a scrolling target as fixed while its ancestor refs attach.
  const targetNode = scope && !scroll ? null : anchor?.node;
  measure(frameNode, receive("frameMeasurement"));
  relative(coachNode, frameNode, receive("coach"));
  relative(
    targetNode,
    scroll ? (webContent ? scroll.content : scroll.viewport) : frameNode,
    receive("element"),
  );
  relative(scroll?.viewport, frameNode, receive("viewport"));
  relative(
    webContent ? webContent.content : null,
    frameNode,
    receive("content"),
  );
  // Fabric supplies these callbacks synchronously. Keep that result in the
  // layout effect instead of deferring its React update through Promise.all.
  // RN Web may deliver callbacks later and still needs an asynchronous result.
  if (result !== undefined) return result;
  return new Promise((resolve) => {
    complete = resolve;
  });
}

interface LayoutMeasurements {
  frameMeasurement: TourRect | null;
  coach: TourRect | null;
  element: TourRect | null;
  viewport: TourRect | null;
  content: TourRect | null;
}

function layoutFromMeasurements(
  { frameMeasurement, coach, element, viewport, content }: LayoutMeasurements,
  scrolling: boolean,
  webContent: boolean,
  insetTop: number,
): TourLayout | null {
  if (!frameMeasurement) return null;
  const frame = {
    x: 0,
    y: 0,
    width: frameMeasurement.width,
    height: frameMeasurement.height,
  };
  const coachHole = coach && tourHole(frame, coach);
  if (!coachHole) return null;
  const result: TourLayout = {
    frame,
    coach: coachHole,
    spotlight: null,
    viewport: null,
  };
  if (!element) return result;
  if (!scrolling)
    return { ...result, spotlight: tourHole(frame, element, frame, 5) };
  if (!viewport || (webContent && !content)) return result;
  // Fabric's measureLayout to the viewport excludes scrolling. RN Web uses
  // visual rectangles, so measure within the moving content and add its fixed inset.
  const unscrolled = {
    ...element,
    x: element.x + (webContent ? content!.x : viewport.x),
    y: element.y + viewport.y + (webContent ? insetTop : 0),
  };
  const geometry = tourScrollingGeometry(frame, viewport, unscrolled);
  return geometry ? { ...result, ...geometry } : result;
}
