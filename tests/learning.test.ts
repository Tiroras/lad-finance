import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLearningProgressStore,
  decodeLearningProgress,
  initialLearningProgress,
} from "../src/features/settings/model/learningProgress";

test("tour metadata rejects malformed records and contains no financial drafts", () => {
  for (const raw of [
    null,
    "",
    "broken",
    "null",
    '{"version":99}',
    "x".repeat(8001),
  ]) {
    assert.deepEqual(decodeLearningProgress(raw), initialLearningProgress());
  }
  const progress = decodeLearningProgress(
    JSON.stringify({
      version: 2,
      status: "started",
      step: "removed-screen",
      completed: ["accounts"],
      pages: { goals: 2 },
      accountName: "Should not be stored",
      balance: 123,
      transaction: { amount: 100 },
    }),
  );
  assert.deepEqual(progress, {
    ...initialLearningProgress(),
    status: "started",
  });
  assert.equal(typeof progress.step, "string");
});

test("old lesson positions restart at the first real screen without reusing numeric steps", () => {
  for (const status of ["new", "started", "completed"] as const) {
    const migrated = decodeLearningProgress(
      JSON.stringify({
        version: 1,
        status,
        step: 4,
        completed: ["accounts", "operations", "overview"],
        pages: { goals: 2 },
        overviewActive: true,
        overviewSpot: 2,
      }),
    );
    assert.deepEqual(migrated, {
      ...initialLearningProgress(),
      status: status === "started" ? "started" : "new",
    });
  }
});

test("a saved screen cursor roundtrips independently of old lesson positions", () => {
  const saved = {
    version: 2 as const,
    status: "started" as const,
    step: "plan-forecast",
  };
  assert.deepEqual(decodeLearningProgress(JSON.stringify(saved)), saved);
});

test("tour writes are ordered, publish only after saving and survive reload", async () => {
  let raw: string | null = null;
  let reads = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const storage = {
    async read() {
      reads++;
      return raw;
    },
    async write(value: string) {
      writes++;
      if (writes === 1) await gate;
      raw = value;
    },
  };
  const store = createLearningProgressStore(storage);
  assert.equal(reads, 0);
  await Promise.all([store.load(), store.load()]);
  assert.equal(reads, 1);
  const first = store.update((value) => ({ ...value, status: "started" }));
  let secondObservedStatus: string | undefined;
  const second = store.update((value) => {
    secondObservedStatus = value.status;
    return { ...value, status: "completed" };
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(writes, 1);
  assert.equal(store.getSnapshot().saving, true);
  assert.equal(store.getSnapshot().progress.status, "new");
  release();
  await Promise.all([first, second]);
  assert.equal(secondObservedStatus, "started");
  assert.equal(store.getSnapshot().progress.status, "completed");
  assert.equal(store.getSnapshot().saving, false);
  const reopened = createLearningProgressStore(storage);
  await reopened.load();
  assert.deepEqual(
    reopened.getSnapshot().progress,
    store.getSnapshot().progress,
  );
});

test("failed tour saves retain the current route and allow a later retry", async () => {
  let fail = true;
  const store = createLearningProgressStore({
    async read() {
      return null;
    },
    async write() {
      if (fail) throw new Error("disk full");
    },
  });
  await assert.rejects(
    store.update((value) => ({ ...value, status: "started" })),
    /сохранить прогресс/,
  );
  assert.deepEqual(store.getSnapshot().progress, initialLearningProgress());
  assert.equal(store.getSnapshot().saving, false);
  fail = false;
  await store.update((value) => ({ ...value, status: "started" }));
  assert.equal(store.getSnapshot().progress.status, "started");
  assert.equal(store.getSnapshot().error, "");
});

test("failed tour reads cannot overwrite existing progress and can be retried", async () => {
  let fail = true;
  let writes = 0;
  const saved = {
    ...initialLearningProgress(),
    status: "started" as const,
  };
  const store = createLearningProgressStore({
    async read() {
      if (fail) throw new Error("unavailable");
      return JSON.stringify(saved);
    },
    async write() {
      writes++;
    },
  });
  await assert.rejects(
    store.update((value) => ({ ...value, status: "completed" })),
    /загрузить прогресс/,
  );
  assert.equal(writes, 0);
  assert.equal(store.getSnapshot().ready, false);
  fail = false;
  await store.load();
  assert.deepEqual(store.getSnapshot().progress, saved);
});
