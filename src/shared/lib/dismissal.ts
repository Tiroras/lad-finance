export interface DismissalGuard {
  hasChanges: () => boolean;
  description: string;
}

export interface PendingDismissal {
  description: string;
  action: () => void;
}

/** A transient confirmation: no draft values or navigation state are persisted. */
export function createDismissalController() {
  let guard: DismissalGuard | undefined;
  let pending: PendingDismissal | null = null;
  let accepting = false;
  const listeners = new Set<() => void>();
  const publish = (value: PendingDismissal | null) => {
    pending = value;
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => pending,
    register(value: DismissalGuard) {
      guard = value;
      return () => {
        if (guard !== value) return;
        guard = undefined;
        if (pending) publish(null);
      };
    },
    request(action: () => void): boolean {
      if (accepting) {
        action();
        return true;
      }
      if (pending) return false;
      if (guard?.hasChanges()) {
        publish({ description: guard.description, action });
        return false;
      }
      action();
      return true;
    },
    cancel: () => publish(null),
    discard() {
      const action = pending?.action;
      if (!action) return;
      publish(null);
      // A sheet Back action may itself ask the tour to leave this step.
      // One explicit confirmation also authorizes that nested transition.
      accepting = true;
      try {
        action();
      } finally {
        accepting = false;
      }
    },
  };
}

export type DismissalController = ReturnType<typeof createDismissalController>;
