import assert from "node:assert/strict";
import { test } from "node:test";
import { createSaveQueue } from "../src/state/finance/saveQueue";
import {
  reliabilityProfiles,
  reliabilitySnapshots,
  snapshotEvidence,
} from "./helpers/saveReliability";

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

for (let repetition = 1; repetition <= 3; repetition += 1) {
  test(`A05 flush is not a revision/profile acknowledgement, delayed retry preserves the entire snapshot (${repetition})`, async () => {
    const [s0, s1, s2] = reliabilitySnapshots();
    const [profile, other] = reliabilityProfiles;
    const disk = new Map([
      [profile, s0],
      [other, s0],
    ]);
    const lastSaved = new Map(disk);
    const gate = deferred(),
      started = deferred();
    const statuses: boolean[] = [];
    let fail = true;
    const queue = createSaveQueue<{
      profile: typeof profile;
      state: typeof s0;
    }>(
      async (value) => {
        started.resolve();
        await gate.promise;
        if (fail) throw new Error("A05 injected disk full");
        disk.set(value.profile, value.state);
        lastSaved.set(value.profile, value.state);
      },
      (failed) => statuses.push(failed),
    );
    queue.enqueue({ profile, state: s1 });
    await started.promise;
    assert.equal(lastSaved.get(profile), s0);
    assert.equal(disk.get(profile), s0);
    gate.resolve();
    await queue.flush();
    assert.deepEqual(statuses, [true]);
    assert.notEqual(
      lastSaved.get(profile),
      s1,
      "flush resolved despite failed persistence",
    );
    assert.equal(lastSaved.get(other), s0);
    // A new change is an entire S2, not a patch that depends on failed S1.
    fail = false;
    queue.enqueue({ profile, state: s2 });
    await queue.flush();
    assert.equal(lastSaved.get(profile), s2);
    assert.deepEqual(
      snapshotEvidence(disk.get(profile)!),
      snapshotEvidence(s2),
    );
    assert.equal(disk.get(other), s0);
    assert.deepEqual(statuses, [true, false]);
  });

  test(`A05 delayed failed S1 reaches pending S2 without acknowledging S1 or another profile (${repetition})`, async () => {
    const [s0, s1, s2] = reliabilitySnapshots();
    const gate = deferred(),
      started = deferred();
    const writes: (typeof s0)[] = [],
      acknowledgements: (typeof s0)[] = [];
    const statuses: boolean[] = [];
    let stored = s0;
    const queue = createSaveQueue<typeof s0>(
      async (state) => {
        writes.push(state);
        if (state === s1) {
          started.resolve();
          await gate.promise;
          throw new Error("A05 injected write failure");
        }
        stored = state;
        acknowledgements.push(state);
      },
      (failed) => statuses.push(failed),
    );
    queue.enqueue(s1);
    await started.promise;
    queue.enqueue(s2);
    gate.resolve();
    await queue.flush();
    assert.deepEqual(writes, [s1, s2]);
    assert.deepEqual(acknowledgements, [s2]);
    assert.deepEqual(statuses, [false]);
    assert.deepEqual(snapshotEvidence(stored), snapshotEvidence(s2));
  });
}
