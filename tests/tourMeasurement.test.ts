import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ScrollView, View } from "react-native";
import ts from "typescript";
import type { TourAnchor, TourScrollScope } from "../src/shared/ui/TourContext";
import * as tourGeometry from "../src/shared/ui/tourGeometry";
import type { TourLayout } from "../src/shared/ui/tourMeasurement";
import { createTourMeasurementQueue } from "../src/shared/ui/tourMeasurementQueue";

const filename = new URL(
  "../src/shared/ui/tourMeasurement.ts",
  import.meta.url,
);
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename.pathname,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

type Coordinates = [number, number, number, number];

function fixture(
  platform: "android" | "ios" | "web" = "android",
  scrollMounted = true,
) {
  const pending: (() => void)[] = [];
  const relativeCalls: { node: View; parent: unknown }[] = [];
  const deliver = (callback: () => void) => {
    if (platform === "web") pending.push(callback);
    else callback();
  };
  const node = (coordinates: Coordinates) => {
    const measurement = { coordinates, failed: false };
    const view = {
      measureInWindow(callback: (...values: Coordinates) => void) {
        deliver(() => callback(...measurement.coordinates));
      },
      measureLayout(
        parent: unknown,
        callback: (...values: Coordinates) => void,
        onFail: () => void,
      ) {
        relativeCalls.push({ node: view, parent });
        deliver(() => {
          if (measurement.failed) onFail();
          else callback(...measurement.coordinates);
        });
      },
    } as unknown as View;
    return { view, measurement };
  };
  const frame = node([12, 48, 390, 844]);
  const coach = node([16, 12, 358, 160]);
  const viewport = node([20, 190, 350, 580]);
  const content = node([40, -327, 310, 1700]);
  const element = node([15, 920, 100, 44]);
  const scrollView = {
    getNativeScrollRef: () => viewport.view,
  } as unknown as ScrollView;
  const scope: TourScrollScope = {
    scrollRef: { current: scrollMounted ? scrollView : null },
    contentRef: { current: scrollMounted ? content.view : null },
    contentInsetTop: 28,
  };
  const anchor: TourAnchor = {
    id: "active-button",
    node: element.view,
    scroll: scope,
  };
  const modules: Record<string, unknown> = {
    "react-native": {
      Platform: { OS: platform },
      PixelRatio: { roundToNearestPixel: (value: number) => value },
    },
    "./tourGeometry": tourGeometry,
  };
  const exports = {} as typeof import("../src/shared/ui/tourMeasurement");
  // Run the real measurement code with native callbacks delivered immediately.
  // A Promise or animation frame would move its result out of the layout effect.
  runInNewContext(
    source,
    {
      exports,
      require(name: string) {
        assert.ok(name in modules, `Unexpected measurement import: ${name}`);
        return modules[name];
      },
      Promise:
        platform === "web"
          ? Promise
          : class {
              constructor() {
                assert.fail("Native measurements must not await a Promise");
              }
            },
      requestAnimationFrame() {
        assert.fail("Measuring layout must not wait for an animation frame");
      },
    },
    { filename: filename.pathname },
  );
  return {
    ...exports,
    frame,
    coach,
    viewport,
    content,
    element,
    scrollView,
    scope,
    anchor,
    pending,
    relativeCalls,
  };
}

function immediate(
  value: TourLayout | null | Promise<TourLayout | null>,
): TourLayout {
  assert.ok(value && !("then" in value), "Layout must be ready on return");
  return structuredClone(value);
}

const frameRect = { x: 0, y: 0, width: 390, height: 844 };
const coachRect = { x: 16, y: 12, width: 358, height: 160 };
const viewportRect = { x: 20, y: 190, width: 350, height: 580 };
const coachOnly = {
  frame: frameRect,
  coach: coachRect,
  spotlight: null,
  viewport: null,
};

test("native measurements return the unscrolled spotlight synchronously on Android and iOS", () => {
  for (const platform of ["android", "ios"] as const) {
    const f = fixture(platform);
    const layout = immediate(
      f.measureTourLayout(f.frame.view, f.coach.view, f.anchor),
    );
    assert.deepEqual(layout, {
      frame: frameRect,
      coach: coachRect,
      viewport: viewportRect,
      spotlight: { x: 10, y: 915, width: 110, height: 54 },
    });
    assert.equal(
      f.relativeCalls.find((call) => call.node === f.element.view)?.parent,
      f.viewport.view,
    );
    assert.equal(
      f.relativeCalls.some((call) => call.node === f.content.view),
      false,
    );
    assert.equal(f.pending.length, 0);
  }
});

test("a fixed native target gets its clipped hole in the same layout measurement", () => {
  const f = fixture();
  f.element.measurement.coordinates = [350, 810, 60, 44];
  const layout = immediate(
    f.measureTourLayout(f.frame.view, f.coach.view, {
      id: f.anchor.id,
      node: f.element.view,
    }),
  );
  assert.deepEqual(layout, {
    ...coachOnly,
    spotlight: { x: 345, y: 805, width: 45, height: 39 },
  });
  assert.equal(
    f.relativeCalls.find((call) => call.node === f.element.view)?.parent,
    f.frame.view,
  );
});

test("late native layout restores the coach and fixed target without waiting for an animation frame", () => {
  const f = fixture();
  const anchor: TourAnchor = { id: "nav.plan", node: f.element.view };
  const frames = new Map<number, () => void>();
  const cancelled: number[] = [];
  const published: (TourLayout | null)[] = [];
  let nextHandle = 0;
  const queue = createTourMeasurementQueue({
    schedule(callback) {
      const handle = ++nextHandle;
      frames.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      cancelled.push(handle);
      frames.delete(handle);
    },
    measure: () => f.measureTourLayout(f.frame.view, f.coach.view, anchor),
    publish: (value) => published.push(structuredClone(value)),
  });

  // The new presentation surface may not have its final host layout yet.
  f.coach.measurement.coordinates = [16, 84, 358, 0];
  queue.requestImmediate();
  assert.deepEqual(published, [null]);

  f.coach.measurement.coordinates = [16, 84, 358, 184];
  f.element.measurement.coordinates = [235, 750, 65, 56];
  queue.request();
  assert.equal(frames.size, 1);
  // A host layout/show notification must replace the waiting RAF. No scheduled
  // callback is executed in this test and no subsequent touch is simulated.
  queue.requestImmediate();
  const ready = {
    frame: frameRect,
    coach: { x: 16, y: 84, width: 358, height: 184 },
    spotlight: { x: 230, y: 745, width: 75, height: 66 },
    viewport: null,
  };
  assert.deepEqual(published, [null, ready]);
  assert.deepEqual(cancelled, [1]);
  assert.equal(frames.size, 0);

  f.coach.measurement.coordinates = [16, 84, 358, 203];
  f.element.measurement.coordinates = [235, 770, 65, 56];
  queue.requestImmediate();
  assert.deepEqual(published[2], {
    ...ready,
    coach: { x: 16, y: 84, width: 358, height: 203 },
    spotlight: { x: 230, y: 765, width: 75, height: 66 },
  });
  assert.equal(frames.size, 0);
  assert.equal(nextHandle, 1);
  queue.dispose();
});

test("scroll refs mounted after anchor registration are resolved when measuring the new target", () => {
  const f = fixture("android", false);
  assert.equal(f.scope.scrollRef.current, null);
  assert.equal(f.scope.contentRef.current, null);
  // A child's layout effect may register its anchor before its parent refs attach.
  // Measuring after the parent commits must use those refs without another touch.
  f.scope.scrollRef.current = f.scrollView;
  f.scope.contentRef.current = f.content.view;
  assert.deepEqual(
    immediate(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor)),
    {
      frame: frameRect,
      coach: coachRect,
      viewport: viewportRect,
      spotlight: { x: 10, y: 915, width: 110, height: 54 },
    },
  );
});

test("Web waits for every measurement and applies the content inset without adding its scrolled position", async () => {
  const f = fixture("web");
  const result = f.measureTourLayout(f.frame.view, f.coach.view, f.anchor);
  assert.ok(result instanceof Promise);
  let completed = false;
  void result.then(() => {
    completed = true;
  });
  assert.equal(f.pending.length, 5);
  // Browser callbacks may arrive in any order. The last one is the frame here.
  while (f.pending.length > 1) f.pending.pop()!();
  await Promise.resolve();
  assert.equal(completed, false);
  f.pending.pop()!();
  assert.deepEqual(structuredClone(await result), {
    frame: frameRect,
    coach: coachRect,
    viewport: viewportRect,
    spotlight: { x: 30, y: 943, width: 110, height: 54 },
  });
  assert.equal(
    f.relativeCalls.find((call) => call.node === f.element.view)?.parent,
    f.content.view,
  );

  f.content.measurement.coordinates[1] -= 400;
  const scrolled = f.measureTourLayout(f.frame.view, f.coach.view, f.anchor);
  while (f.pending.length) f.pending.shift()!();
  assert.deepEqual(
    structuredClone(await scrolled),
    structuredClone(await result),
  );
});

test("missing or detached layout roots cannot produce a dimming layout", () => {
  const f = fixture();
  assert.equal(f.measureTourLayout(null, f.coach.view, f.anchor), null);
  assert.equal(f.measureTourLayout(f.frame.view, null, f.anchor), null);
  assert.equal(f.relativeCalls.length, 0);

  f.coach.measurement.failed = true;
  assert.equal(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor), null);
  f.coach.measurement.failed = false;
  f.frame.measurement.coordinates[2] = 0;
  assert.equal(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor), null);
});

test("missing, detached, and invalid native targets retain only the coach opening", () => {
  const f = fixture();
  assert.deepEqual(
    immediate(f.measureTourLayout(f.frame.view, f.coach.view, null)),
    coachOnly,
  );
  f.element.measurement.failed = true;
  assert.deepEqual(
    immediate(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor)),
    coachOnly,
  );
  f.element.measurement.failed = false;
  for (const coordinates of [
    [15, 920, 0, 44],
    [15, Number.NaN, 100, 44],
    [15, 920, 100, Number.POSITIVE_INFINITY],
  ] satisfies Coordinates[]) {
    f.element.measurement.coordinates = coordinates;
    assert.deepEqual(
      immediate(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor)),
      coachOnly,
    );
  }
});

test("a failed scrolling viewport never exposes an unbounded target hole", () => {
  const f = fixture();
  f.viewport.measurement.failed = true;
  assert.deepEqual(
    immediate(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor)),
    coachOnly,
  );
});

test("detached scroll refs cannot turn a scrolling anchor into a fixed target", () => {
  for (const detached of ["scrollRef", "contentRef"] as const) {
    const f = fixture();
    f.scope[detached].current = null;
    assert.deepEqual(
      immediate(f.measureTourLayout(f.frame.view, f.coach.view, f.anchor)),
      coachOnly,
    );
    assert.equal(
      f.relativeCalls.some((call) => call.node === f.element.view),
      false,
    );
  }
});

test("Web measurement failure resolves without exposing the target or losing the coach", async () => {
  const f = fixture("web");
  f.content.measurement.failed = true;
  const result = f.measureTourLayout(f.frame.view, f.coach.view, f.anchor);
  while (f.pending.length) f.pending.shift()!();
  assert.deepEqual(structuredClone(await result), coachOnly);
});
