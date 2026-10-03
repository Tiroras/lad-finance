export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function sameTourRect(a: TourRect | null, b: TourRect | null): boolean {
  return (
    a === b ||
    !!(
      a &&
      b &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height
    )
  );
}

/** A moving hole uses content coordinates; only its horizontal edges are clipped here. */
export function tourScrollingGeometry(
  frame: TourRect,
  viewport: TourRect,
  element: TourRect,
  padding = 5,
): { viewport: TourRect; spotlight: TourRect } | null {
  const clipped = intersectTourRects(frame, viewport);
  if (
    !clipped ||
    !Number.isFinite(padding) ||
    padding < 0 ||
    ![element.x, element.y, element.width, element.height].every(
      Number.isFinite,
    ) ||
    element.width <= 0 ||
    element.height <= 0
  )
    return null;
  const left = Math.max(element.x - padding, clipped.x);
  const right = Math.min(
    element.x + element.width + padding,
    clipped.x + clipped.width,
  );
  if (right <= left) return null;
  return {
    viewport: clipped,
    spotlight: {
      x: left - clipped.x,
      y: element.y - padding - clipped.y,
      width: right - left,
      height: element.height + padding * 2,
    },
  };
}

/** Non-overlapping native rectangles cover the frame except the union of its holes. */
export function tourDimPanels(
  frame: TourRect,
  holes: readonly TourRect[],
): TourRect[] {
  const clipped = holes
    .map((hole) => intersectTourRects(frame, hole))
    .filter((hole): hole is TourRect => !!hole);
  const edges = [
    ...new Set([
      frame.y,
      frame.y + frame.height,
      ...clipped.flatMap((hole) => [hole.y, hole.y + hole.height]),
    ]),
  ].sort((a, b) => a - b);
  const panels: TourRect[] = [];
  for (let index = 0; index + 1 < edges.length; index++) {
    const top = edges[index];
    const bottom = edges[index + 1];
    const rowHoles = clipped
      .filter((hole) => hole.y < bottom && hole.y + hole.height > top)
      .sort((a, b) => a.x - b.x);
    let left = frame.x;
    const add = (right: number) => {
      if (right <= left) return;
      const above = panels.find(
        (panel) =>
          panel.x === left &&
          panel.width === right - left &&
          panel.y + panel.height === top,
      );
      if (above) above.height += bottom - top;
      else
        panels.push({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        });
    };
    for (const hole of rowHoles) {
      add(hole.x);
      left = Math.max(left, hole.x + hole.width);
    }
    add(frame.x + frame.width);
  }
  return panels;
}

export function intersectTourRects(a: TourRect, b: TourRect): TourRect | null {
  if (
    ![...Object.values(a), ...Object.values(b)].every(Number.isFinite) ||
    a.width <= 0 ||
    a.height <= 0 ||
    b.width <= 0 ||
    b.height <= 0
  )
    return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

/** Window measurements become holes local to the frame, clipped to visible content. */
export function tourHole(
  frame: TourRect,
  element: TourRect,
  viewport: TourRect = frame,
  padding = 0,
): TourRect | null {
  // An offscreen element must never punch a hole through a header or navigation bar.
  if (!intersectTourRects(element, viewport)) return null;
  const expanded = {
    x: element.x - padding,
    y: element.y - padding,
    width: element.width + padding * 2,
    height: element.height + padding * 2,
  };
  const visible = intersectTourRects(expanded, viewport);
  const clipped = visible && intersectTourRects(visible, frame);
  return clipped
    ? { ...clipped, x: clipped.x - frame.x, y: clipped.y - frame.y }
    : null;
}
