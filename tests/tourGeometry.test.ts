import assert from "node:assert/strict";
import { test } from "node:test";
import {
  intersectTourRects,
  tourDimPanels,
  tourHole,
  tourScrollingGeometry,
  type TourRect,
} from "../src/shared/ui/tourGeometry";

test("scrolling geometry retains the unscrolled content position independently of the visible height", () => {
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const viewport = { x: 21, y: 260, width: 348, height: 500 };
  const element = { x: 50, y: 960, width: 100, height: 40 };
  const before = structuredClone({ frame, viewport, element });
  const expectedSpotlight = { x: 24, y: 695, width: 110, height: 50 };
  assert.deepEqual(tourScrollingGeometry(frame, viewport, element), {
    viewport,
    spotlight: expectedSpotlight,
  });
  // A keyboard or a taller coach can shrink the viewport. The native offset
  // still applies to the same full content-space target, including its height.
  assert.deepEqual(
    tourScrollingGeometry(frame, { ...viewport, height: 140 }, element),
    {
      viewport: { ...viewport, height: 140 },
      spotlight: expectedSpotlight,
    },
  );
  assert.deepEqual({ frame, viewport, element }, before);
});

test("scrolling geometry clips the viewport to the frame and anchors the hole to that clipped origin", () => {
  assert.deepEqual(
    tourScrollingGeometry(
      { x: 30, y: 24, width: 200, height: 300 },
      { x: 0, y: 0, width: 300, height: 400 },
      { x: 20, y: 500, width: 250, height: 20 },
    ),
    {
      viewport: { x: 30, y: 24, width: 200, height: 300 },
      spotlight: { x: 0, y: 471, width: 200, height: 30 },
    },
  );
});

test("scrolling target padding never opens a hole beyond either horizontal viewport edge", () => {
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const viewport = { x: 20, y: 100, width: 200, height: 300 };
  for (const [element, spotlight] of [
    [
      { x: 22, y: 160, width: 30, height: 40 },
      { x: 0, y: 55, width: 37, height: 50 },
    ],
    [
      { x: 195, y: 160, width: 22, height: 40 },
      { x: 170, y: 55, width: 30, height: 50 },
    ],
    [
      { x: 10, y: 160, width: 230, height: 40 },
      { x: 0, y: 55, width: 200, height: 50 },
    ],
  ])
    assert.deepEqual(tourScrollingGeometry(frame, viewport, element), {
      viewport,
      spotlight,
    });
});

test("targets above and below the viewport retain their complete vertical baseline for native scrolling", () => {
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const viewport = { x: 0, y: 270, width: 320, height: 290 };
  assert.deepEqual(
    tourScrollingGeometry(
      frame,
      viewport,
      { x: 20, y: 50, width: 44, height: 44 },
      0,
    ),
    {
      viewport,
      spotlight: { x: 20, y: -220, width: 44, height: 44 },
    },
  );
  assert.deepEqual(
    tourScrollingGeometry(
      frame,
      viewport,
      { x: 20, y: 1000, width: 44, height: 80 },
      0,
    ),
    {
      viewport,
      spotlight: { x: 20, y: 730, width: 44, height: 80 },
    },
  );
});

test("scrolling geometry preserves fractional coordinates without truncating the padded target", () => {
  assert.deepEqual(
    tourScrollingGeometry(
      { x: 0, y: 0, width: 320, height: 640 },
      { x: 10.25, y: 100.5, width: 200.75, height: 150.25 },
      { x: 11.5, y: 199.25, width: 44.5, height: 37.25 },
      2.5,
    ),
    {
      viewport: { x: 10.25, y: 100.5, width: 200.75, height: 150.25 },
      spotlight: { x: 0, y: 96.25, width: 48.25, height: 42.25 },
    },
  );
});

test("invalid or horizontally disjoint scrolling geometry never produces an animated hole", () => {
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const viewport = { x: 20, y: 100, width: 200, height: 300 };
  const element = { x: 50, y: 120, width: 44, height: 44 };
  for (const invalid of [
    { ...frame, width: 0 },
    { ...frame, x: Number.NaN },
    { ...frame, height: Number.POSITIVE_INFINITY },
  ])
    assert.equal(tourScrollingGeometry(invalid, viewport, element), null);
  for (const invalid of [
    { ...viewport, height: -1 },
    { ...viewport, y: Number.NaN },
    { ...viewport, x: 400 },
  ])
    assert.equal(tourScrollingGeometry(frame, invalid, element), null);
  for (const invalid of [
    { ...element, height: 0 },
    { ...element, width: -1 },
    { ...element, y: Number.NaN },
    { ...element, x: Number.NEGATIVE_INFINITY },
    { ...element, x: -100 },
    { ...element, x: 300 },
  ])
    assert.equal(tourScrollingGeometry(frame, viewport, invalid), null);
  for (const padding of [Number.NaN, Number.POSITIVE_INFINITY, -1])
    assert.equal(
      tourScrollingGeometry(frame, viewport, element, padding),
      null,
    );
});

test("spotlight coordinates account for the frame origin and a padded touch target", () => {
  assert.deepEqual(
    tourHole(
      { x: 30, y: 24, width: 390, height: 780 },
      { x: 70, y: 144, width: 44, height: 44 },
      undefined,
      5,
    ),
    { x: 35, y: 115, width: 54, height: 54 },
  );
});

test("a scrolling target cannot expose dimmed content behind a fixed coach or navigation", () => {
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const viewport = { x: 0, y: 270, width: 320, height: 290 };
  assert.deepEqual(
    tourHole(frame, { x: 20, y: 250, width: 280, height: 60 }, viewport, 5),
    { x: 15, y: 270, width: 290, height: 45 },
  );
  assert.deepEqual(
    tourHole(frame, { x: 20, y: 540, width: 280, height: 60 }, viewport, 5),
    { x: 15, y: 535, width: 290, height: 25 },
  );
  assert.equal(
    tourHole(frame, { x: 20, y: 211, width: 44, height: 58 }, viewport, 5),
    null,
  );
  assert.equal(
    tourHole(frame, { x: 20, y: 560, width: 44, height: 44 }, viewport, 5),
    null,
  );
});

test("holes at screen edges stay inside the frame and invalid measurements reveal nothing", () => {
  const frame = { x: 0, y: 24, width: 320, height: 600 };
  assert.deepEqual(
    tourHole(frame, { x: 0, y: 600, width: 80, height: 24 }, undefined, 5),
    { x: 0, y: 571, width: 85, height: 29 },
  );
  for (const invalid of [
    { x: 0, y: 100, width: 0, height: 44 },
    { x: Number.NaN, y: 100, width: 44, height: 44 },
    { x: 321, y: 100, width: 44, height: 44 },
  ])
    assert.equal(tourHole(frame, invalid), null);
});

const curtainCases: {
  name: string;
  frame?: TourRect;
  holes: TourRect[];
  dimmedArea: number;
}[] = [
  { name: "no holes", holes: [], dimmedArea: 10000 },
  {
    name: "separate coach and target",
    holes: [
      { x: 10, y: 10, width: 80, height: 20 },
      { x: 50, y: 60, width: 40, height: 30 },
    ],
    dimmedArea: 7200,
  },
  {
    name: "overlapping holes",
    holes: [
      { x: 10, y: 10, width: 60, height: 40 },
      { x: 40, y: 30, width: 40, height: 40 },
    ],
    dimmedArea: 6600,
  },
  {
    name: "one hole inside another",
    holes: [
      { x: 10, y: 10, width: 80, height: 80 },
      { x: 20, y: 20, width: 20, height: 20 },
    ],
    dimmedArea: 3600,
  },
  {
    name: "touching holes that cover the frame",
    holes: [
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 50, height: 100 },
    ],
    dimmedArea: 0,
  },
  {
    name: "clipped and offscreen holes in an offset frame",
    frame: { x: 30, y: 20, width: 100, height: 80 },
    holes: [
      { x: 20, y: 10, width: 40, height: 40 },
      { x: 110, y: 80, width: 40, height: 40 },
      { x: 150, y: 150, width: 40, height: 40 },
    ],
    dimmedArea: 6700,
  },
  {
    name: "fractional physical-pixel coordinates",
    frame: { x: 0, y: 0, width: 10.5, height: 10.5 },
    holes: [{ x: 0.5, y: 0.5, width: 2.5, height: 2.5 }],
    dimmedArea: 104,
  },
];

for (const {
  name,
  frame = { x: 0, y: 0, width: 100, height: 100 },
  holes,
  dimmedArea,
} of curtainCases) {
  test(`curtain covers only the surrounding area once: ${name}`, () => {
    const panels = tourDimPanels(frame, holes);
    for (const [index, panel] of panels.entries()) {
      assert.ok(panel.width > 0 && panel.height > 0);
      assert.deepEqual(intersectTourRects(frame, panel), panel);
      for (const hole of holes)
        assert.equal(intersectTourRects(panel, hole), null);
      for (const other of panels.slice(index + 1))
        assert.equal(
          intersectTourRects(panel, other),
          null,
          "overlapping fills would darken the same area twice",
        );
    }
    assert.equal(
      panels.reduce((area, panel) => area + panel.width * panel.height, 0),
      dimmedArea,
    );
  });
}
