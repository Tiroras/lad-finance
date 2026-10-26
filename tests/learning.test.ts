import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLearningProgressStore,
  decodeLearningProgress,
  initialLearningProgress,
} from "../src/features/settings/model/learningProgress";

test("reset waits for pending progress writes and reloads from cleared storage", async () => {
  let raw: string | null = null;
  let release!: () => void;
  let started!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = createLearningProgressStore({
    read: async () => raw,
    async write(value) {
      started();
      await gate;
      raw = value;
    },
  });
  const update = store.update((value) => ({ ...value, status: "completed" }));
  await writing;
  let reset = false;
  const clearing = store.resetMemory().then(() => {
    reset = true;
  });
  await Promise.resolve();
  assert.equal(reset, false);
  release();
  await update;
  await clearing;
  raw = null;
  await store.load();
  assert.deepEqual(store.getSnapshot().progress, initialLearningProgress());
});

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

test("first launch route survives reload without adding fields to old progress", async () => {
  let raw: string | null = null;
  const storage = {
    async read() {
      return raw;
    },
    async write(value: string) {
      raw = value;
    },
  };
  const store = createLearningProgressStore(storage);
  await store.update((value) => ({ ...value, firstRun: "setup" }));
  const reopened = createLearningProgressStore(storage);
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().progress, {
    ...initialLearningProgress(),
    firstRun: "setup",
  });
  await reopened.update((value) => ({
    ...value,
    firstRun: undefined,
    status: "skipped",
  }));
  assert.deepEqual(decodeLearningProgress(raw), {
    ...initialLearningProgress(),
    status: "skipped",
  });
  assert.equal(Object.hasOwn(decodeLearningProgress(raw), "firstRun"), false);
  assert.deepEqual(
    decodeLearningProgress(
      JSON.stringify({
        ...initialLearningProgress(),
        firstRun: "unknown",
      }),
    ),
    initialLearningProgress(),
  );
});

test("an explicit skip persists separately from completion and survives a removed step", async () => {
  const started = {
    version: 2 as const,
    status: "started" as const,
    step: "plan-goals",
  };
  let raw = JSON.stringify(started);
  let fail = true;
  const storage = {
    async read() {
      return raw;
    },
    async write(value: string) {
      if (fail) throw new Error("disk full");
      raw = value;
    },
  };
  const store = createLearningProgressStore(storage);
  await assert.rejects(
    store.update((value) => ({ ...value, status: "skipped" })),
    /сохранить прогресс/,
  );
  assert.deepEqual(store.getSnapshot().progress, started);
  assert.deepEqual(JSON.parse(raw), started);
  fail = false;
  await store.update((value) => ({ ...value, status: "skipped" }));
  const reopened = createLearningProgressStore(storage);
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().progress, {
    ...started,
    status: "skipped",
  });
  assert.deepEqual(
    decodeLearningProgress(
      JSON.stringify({ ...started, status: "skipped", step: "removed-screen" }),
    ),
    { ...initialLearningProgress(), status: "skipped" },
  );
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
  const notifications: { saving: boolean; status: string }[] = [];
  store.subscribe(() => {
    const snapshot = store.getSnapshot();
    notifications.push({
      saving: snapshot.saving,
      status: snapshot.progress.status,
    });
  });
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
  assert.deepEqual(notifications, [
    { saving: true, status: "new" },
    { saving: false, status: "started" },
    { saving: true, status: "started" },
    { saving: false, status: "completed" },
  ]);
  const reopened = createLearningProgressStore(storage);
  await reopened.load();
  assert.deepEqual(
    reopened.getSnapshot().progress,
    store.getSnapshot().progress,
  );
});

test("resuming the saved cursor does not write or notify subscribers again", async () => {
  const saved = {
    ...initialLearningProgress(),
    status: "started" as const,
    step: "plan-forecast",
  };
  let writes = 0;
  const store = createLearningProgressStore({
    async read() {
      return JSON.stringify(saved);
    },
    async write() {
      writes++;
    },
  });
  await store.load();
  const before = store.getSnapshot();
  let notifications = 0;
  store.subscribe(() => notifications++);
  await Promise.all([
    store.update((value) => ({ ...value })),
    store.update(() => ({ ...saved })),
  ]);
  assert.equal(writes, 0);
  assert.equal(notifications, 0);
  assert.equal(store.getSnapshot(), before);
});

test("queued requests for the same next cursor persist it only once", async () => {
  let writes = 0;
  const store = createLearningProgressStore({
    async read() {
      return null;
    },
    async write() {
      writes++;
    },
  });
  await Promise.all([
    store.update((value) => ({ ...value, status: "started" })),
    store.update((value) => ({ ...value, status: "started" })),
  ]);
  assert.equal(writes, 1);
  assert.equal(store.getSnapshot().progress.status, "started");
  assert.equal(store.getSnapshot().saving, false);
});

test("resuming migrated lesson progress persists the new format once", async () => {
  let raw = JSON.stringify({ version: 1, status: "started", step: 4 });
  let writes = 0;
  const store = createLearningProgressStore({
    async read() {
      return raw;
    },
    async write(value) {
      writes++;
      raw = value;
    },
  });
  await store.load();
  await store.update((value) => ({ ...value }));
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(raw), {
    ...initialLearningProgress(),
    status: "started",
  });
  await store.update((value) => ({ ...value }));
  assert.equal(writes, 1);
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
