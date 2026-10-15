export interface DismissalGuard {
  hasChanges: () => boolean;
  description: string;
  onDiscard?: () => void | Promise<void>;
}

export interface PendingDismissal {
  description: string;
  action: () => void;
  onDiscard?: () => void | Promise<void>;
  busy?: boolean;
  error?: string;
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
        publish({
          description: guard.description,
          action,
          onDiscard: guard.onDiscard,
        });
        return false;
      }
      action();
      return true;
    },
    cancel: () => {
      if (!pending?.busy) publish(null);
    },
    discard() {
      const current = pending;
      if (!current || current.busy) return;
      const complete = () => {
        if (pending?.action !== current.action) return;
        publish(null);
        // One explicit confirmation also authorizes nested navigation.
        accepting = true;
        try {
          current.action();
        } finally {
          accepting = false;
        }
      };
      const failed = (error: unknown) => {
        if (pending?.action !== current.action) return;
        publish({
          ...current,
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось удалить черновик. Повторите попытку.",
        });
      };
      try {
        const result = current.onDiscard?.();
        if (result && typeof result.then === "function") {
          publish({ ...current, busy: true, error: undefined });
          return result.then(complete, failed);
        }
        complete();
      } catch (error) {
        failed(error);
      }
    },
  };
}

export type DismissalController = ReturnType<typeof createDismissalController>;
