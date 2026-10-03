import assert from "node:assert/strict";
import { test } from "node:test";
import { createTourMeasurementQueue } from "../src/shared/ui/tourMeasurementQueue";

function frameScheduler() {
  let nextHandle = 0;
  const frames = new Map<number, () => void>();
  const cancelled: number[] = [];
  return {
    schedule(callback: () => void) {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancel(handle: number) {
      cancelled.push(handle);
      frames.delete(handle);
    },
    frame() {
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach((callback) => callback());
    },
    get pending() {
      return frames.size;
    },
    cancelled,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("an immediate synchronous measurement publishes before the request returns", () => {
  const scheduler = frameScheduler();
  const published: number[] = [];
  let measured = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => ++measured,
    publish: (value) => published.push(value),
  });

  queue.requestImmediate();
  assert.deepEqual(published, [1]);
  assert.equal(scheduler.pending, 0);
  queue.requestImmediate();
  assert.deepEqual(published, [1, 2]);
  assert.equal(scheduler.pending, 0);
});

test("an immediate request replaces a queued frame with one synchronous measurement", () => {
  const scheduler = frameScheduler();
  const published: number[] = [];
  let measured = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => ++measured,
    publish: (value) => published.push(value),
  });

  queue.request();
  queue.request();
  assert.equal(scheduler.pending, 1);
  queue.requestImmediate();
  assert.deepEqual(published, [1]);
  assert.deepEqual(scheduler.cancelled, [0]);
  scheduler.frame();
  assert.equal(measured, 1);
  assert.equal(scheduler.pending, 0);

  queue.request();
  assert.deepEqual(published, [1]);
  scheduler.frame();
  assert.deepEqual(published, [1, 2]);
});

test("immediate requests during an asynchronous batch coalesce without another frame or overlap", async () => {
  const scheduler = frameScheduler();
  const batch = deferred<number>();
  const published: number[] = [];
  let measured = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => (++measured === 1 ? batch.promise : 2),
    publish: (value) => published.push(value),
  });

  queue.requestImmediate();
  for (let index = 0; index < 20; index++) {
    queue.requestImmediate();
    queue.request();
  }
  assert.equal(measured, 1);
  assert.equal(scheduler.pending, 0);
  assert.deepEqual(published, []);
  batch.resolve(1);
  await settle();
  assert.equal(measured, 2);
  assert.deepEqual(published, [1, 2]);
  assert.equal(scheduler.pending, 0);
});

test("layout changes coalesce into one measurement before the next frame", async () => {
  const scheduler = frameScheduler();
  let measured = 0;
  const published: number[] = [];
  const queue = createTourMeasurementQueue({
    ...scheduler,
    async measure() {
      return ++measured;
    },
    publish: (value) => published.push(value),
  });
  for (let index = 0; index < 20; index++) queue.request();
  assert.equal(scheduler.pending, 1);
  assert.equal(measured, 0);
  scheduler.frame();
  await settle();
  assert.equal(measured, 1);
  assert.deepEqual(published, [1]);
  assert.equal(scheduler.pending, 0);
  queue.request();
  scheduler.frame();
  await settle();
  assert.equal(measured, 2);
  assert.deepEqual(published, [1, 2]);
});

test("slow batches never overlap and pending layout changes preserve a completed result", async () => {
  const scheduler = frameScheduler();
  const batches: ReturnType<typeof deferred<number>>[] = [];
  const published: number[] = [];
  let running = 0;
  let maximumRunning = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    async measure() {
      const batch = deferred<number>();
      batches.push(batch);
      maximumRunning = Math.max(maximumRunning, ++running);
      try {
        return await batch.promise;
      } finally {
        running--;
      }
    },
    publish: (value) => published.push(value),
  });
  queue.request();
  scheduler.frame();
  for (let index = 0; index < 20; index++) {
    queue.request();
    scheduler.frame();
  }
  assert.equal(batches.length, 1);
  assert.equal(scheduler.pending, 0);
  assert.deepEqual(published, []);
  batches[0].resolve(10);
  await settle();
  assert.deepEqual(published, [10]);
  assert.equal(scheduler.pending, 1);
  scheduler.frame();
  assert.equal(batches.length, 2);
  queue.request();
  batches[1].resolve(20);
  await settle();
  assert.deepEqual(published, [10, 20]);
  assert.equal(scheduler.pending, 1);
  scheduler.frame();
  assert.equal(batches.length, 3);
  batches[2].resolve(30);
  await settle();
  assert.deepEqual(published, [10, 20, 30]);
  assert.equal(maximumRunning, 1);
  assert.equal(scheduler.pending, 0);
});

test("disposing cancels a scheduled frame and ignores future requests", async () => {
  const scheduler = frameScheduler();
  let measured = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    async measure() {
      measured++;
    },
    publish: () => assert.fail("Disposed measurements must not publish"),
  });
  queue.request();
  queue.dispose();
  queue.dispose();
  queue.request();
  queue.requestImmediate();
  scheduler.frame();
  await settle();
  assert.deepEqual(scheduler.cancelled, [0]);
  assert.equal(scheduler.pending, 0);
  assert.equal(measured, 0);
});

test("disposing an in-flight batch suppresses its result and pending follow-up", async () => {
  const scheduler = frameScheduler();
  const batch = deferred<number>();
  const published: number[] = [];
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => batch.promise,
    publish: (value) => published.push(value),
  });
  queue.request();
  scheduler.frame();
  queue.requestImmediate();
  queue.dispose();
  batch.resolve(1);
  await settle();
  queue.request();
  queue.requestImmediate();
  assert.deepEqual(published, []);
  assert.equal(scheduler.pending, 0);
});

test("a rejected measurement reports once and allows a queued retry", async () => {
  const scheduler = frameScheduler();
  const batch = deferred<number>();
  const published: number[] = [];
  let measured = 0;
  let failures = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => (++measured === 1 ? batch.promise : Promise.resolve(2)),
    publish: (value) => published.push(value),
    onError: () => failures++,
  });
  queue.request();
  scheduler.frame();
  queue.request();
  batch.reject(new Error("Native measurement unavailable"));
  await settle();
  assert.equal(failures, 1);
  assert.deepEqual(published, []);
  assert.equal(scheduler.pending, 1);
  scheduler.frame();
  await settle();
  assert.deepEqual(published, [2]);
  assert.equal(scheduler.pending, 0);
});

test("a rejected immediate measurement allows the pending immediate retry without a frame", async () => {
  const scheduler = frameScheduler();
  const batch = deferred<number>();
  const published: number[] = [];
  let measured = 0;
  let failures = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => (++measured === 1 ? batch.promise : 2),
    publish: (value) => published.push(value),
    onError: () => failures++,
  });

  queue.requestImmediate();
  queue.requestImmediate();
  batch.reject(new Error("Native measurement unavailable"));
  await settle();
  assert.equal(failures, 1);
  assert.deepEqual(published, [2]);
  assert.equal(scheduler.pending, 0);
});

test("synchronous measurement and reporting failures do not stall later requests", async () => {
  const scheduler = frameScheduler();
  const published: number[] = [];
  let measured = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => {
      if (++measured === 1) throw new Error("Detached native view");
      return Promise.resolve(2);
    },
    publish: (value) => published.push(value),
    onError: () => {
      throw new Error("Reporting unavailable");
    },
  });
  queue.request();
  scheduler.frame();
  await settle();
  queue.request();
  scheduler.frame();
  await settle();
  assert.deepEqual(published, [2]);
  assert.equal(scheduler.pending, 0);
});

test("immediate measurement and publication failures allow synchronous retries", () => {
  const scheduler = frameScheduler();
  const published: number[] = [];
  let measured = 0;
  let failures = 0;
  const queue = createTourMeasurementQueue({
    ...scheduler,
    measure: () => {
      if (++measured === 1) throw new Error("Detached native view");
      return measured;
    },
    publish: (value) => {
      if (value === 2) throw new Error("Layout publication failed");
      published.push(value);
    },
    onError: () => {
      failures++;
      throw new Error("Reporting unavailable");
    },
  });

  queue.requestImmediate();
  assert.equal(failures, 1);
  queue.requestImmediate();
  assert.equal(failures, 2);
  queue.requestImmediate();
  assert.deepEqual(published, [3]);
  assert.equal(scheduler.pending, 0);
});
