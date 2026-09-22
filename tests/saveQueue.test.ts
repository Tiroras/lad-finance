import assert from "node:assert/strict";
import { test } from "node:test";
import { createSaveQueue } from "../src/state/finance/saveQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("saving preserves the active snapshot and only the latest pending revision", async () => {
  const first = deferred(),
    started = deferred();
  const written: number[] = [],
    statuses: boolean[] = [];
  const queue = createSaveQueue<number>(
    async (value) => {
      written.push(value);
      if (value === 1) {
        started.resolve();
        await first.promise;
      }
    },
    (failed) => statuses.push(failed),
  );
  queue.enqueue(1);
  await started.promise;
  queue.enqueue(2);
  queue.enqueue(3);
  let flushed = false;
  const flush = queue.flush().then(() => {
    flushed = true;
  });
  await Promise.resolve();
  assert.equal(flushed, false);
  first.resolve();
  await flush;
  assert.deepEqual(written, [1, 3]);
  assert.deepEqual(statuses, [false]);
});

test("a failed write does not strand newer snapshots and the latest snapshot can be retried", async () => {
  const first = deferred(),
    started = deferred();
  const written: number[] = [],
    statuses: boolean[] = [];
  let failLatest = true;
  const queue = createSaveQueue<number>(
    async (value) => {
      written.push(value);
      if (value === 1) {
        started.resolve();
        await first.promise;
        throw new Error("disk full");
      }
      if (failLatest) throw new Error("disk full");
    },
    (failed) => statuses.push(failed),
  );
  queue.enqueue(1);
  await started.promise;
  queue.enqueue(2);
  first.resolve();
  await queue.flush();
  assert.deepEqual(written, [1, 2]);
  assert.deepEqual(statuses, [true]);
  failLatest = false;
  queue.enqueue(2);
  await queue.flush();
  assert.deepEqual(statuses, [true, false]);
  assert.deepEqual(written, [1, 2, 2]);
});
