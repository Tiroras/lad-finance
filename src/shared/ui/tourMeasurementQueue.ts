/** Coalesce layout changes without starting a second native measurement in flight. */
export function createTourMeasurementQueue<T>({
  schedule,
  cancel,
  measure,
  publish,
  onError,
}: {
  schedule: (callback: () => void) => number;
  cancel: (handle: number) => void;
  measure: () => T | Promise<T>;
  publish: (value: T) => void;
  onError?: () => void;
}) {
  let pending = false;
  let pendingImmediate = false;
  let scheduled: number | null = null;
  let measuring = false;
  let disposed = false;

  function schedulePending() {
    if (disposed || measuring || scheduled !== null || !pending) return;
    scheduled = schedule(() => {
      scheduled = null;
      run();
    });
  }

  function reportError() {
    if (disposed) return;
    try {
      onError?.();
    } catch {
      // A reporting failure must not leave measurements running or reject unhandled.
    }
  }

  function finish() {
    measuring = false;
    if (pendingImmediate) run();
    else schedulePending();
  }

  function publishResult(value: T) {
    try {
      if (!disposed) publish(value);
    } catch {
      reportError();
    } finally {
      finish();
    }
  }

  function fail() {
    reportError();
    finish();
  }

  function run() {
    if (disposed || measuring || !pending) return;
    pending = false;
    pendingImmediate = false;
    measuring = true;
    try {
      const result = measure();
      if (isPromise(result)) {
        void Promise.resolve(result).then(publishResult, fail);
      } else {
        publishResult(result);
      }
    } catch {
      fail();
    }
  }

  return {
    request() {
      if (disposed) return;
      pending = true;
      schedulePending();
    },
    /** Keep synchronous native layout reads inside the caller's layout effect. */
    requestImmediate() {
      if (disposed) return;
      pending = true;
      pendingImmediate = true;
      if (scheduled !== null) cancel(scheduled);
      scheduled = null;
      run();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = false;
      pendingImmediate = false;
      if (scheduled !== null) cancel(scheduled);
      scheduled = null;
    },
  };
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value != null && typeof (value as Promise<T>).then === "function";
}
