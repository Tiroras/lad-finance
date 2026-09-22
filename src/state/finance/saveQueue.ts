/** Keep the active write and the newest pending snapshot, preserving write order. */
export function createSaveQueue<T>(
  write: (value: T) => Promise<void>,
  settled: (failed: boolean) => void,
) {
  let pending: { value: T } | undefined;
  let running: Promise<void> | undefined;
  const start = () => {
    running = Promise.resolve()
      .then(async () => {
        while (pending) {
          const { value } = pending;
          pending = undefined;
          let failed = false;
          try {
            await write(value);
          } catch {
            failed = true;
          }
          // An older failure must not replace the status of a newer pending write.
          if (!pending) settled(failed);
        }
      })
      .finally(() => {
        running = undefined;
        if (pending) start();
      });
  };
  return {
    enqueue(value: T) {
      pending = { value };
      if (!running) start();
    },
    async flush() {
      while (running) await running;
    },
  };
}
