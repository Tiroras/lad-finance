import { tourSteps } from "../lib/tourSteps";

// Kept for previously supported navigation contracts; lessons no longer render.
export type LessonId =
  | "accounts"
  | "operations"
  | "plans"
  | "available"
  | "overview"
  | "budgets"
  | "goals"
  | "forecast"
  | "currencies"
  | "data";

export interface LearningProgress {
  version: 2;
  status: "new" | "started" | "completed";
  step: string;
}

export const initialLearningProgress = (): LearningProgress => ({
  version: 2,
  status: "new",
  step: tourSteps[0].id,
});

export function decodeLearningProgress(raw: string | null): LearningProgress {
  const empty = initialLearningProgress();
  if (!raw || raw.length > 8000) return empty;
  try {
    const value = JSON.parse(raw);
    if (value?.version === 1) {
      return {
        ...empty,
        status: value.status === "started" ? "started" : "new",
      };
    }
    if (
      value?.version !== 2 ||
      !["new", "started", "completed"].includes(value.status)
    )
      return empty;
    return {
      version: 2,
      status: value.status,
      step: tourSteps.some((step) => step.id === value.step)
        ? value.step
        : empty.step,
    };
  } catch {
    return empty;
  }
}

// App-wide, nonfinancial metadata only. No amounts, names or form drafts.
export function createLearningProgressStore(storage: {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
}) {
  let snapshot = {
    ready: false,
    saving: false,
    error: "",
    progress: initialLearningProgress(),
  };
  const listeners = new Set<() => void>();
  let loading: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const publish = (patch: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const load = () => {
    if (snapshot.ready) return Promise.resolve();
    loading ??= storage
      .read()
      .then((raw) => {
        publish({
          ready: true,
          error: "",
          progress: decodeLearningProgress(raw),
        });
      })
      .catch(() => {
        const message =
          "Не удалось загрузить прогресс обучения. Попробуйте ещё раз.";
        publish({ error: message });
        throw new Error(message);
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    update(change: (value: LearningProgress) => LearningProgress) {
      const task = queue
        .catch(() => undefined)
        .then(async () => {
          await load();
          publish({ saving: true, error: "" });
          try {
            const next = decodeLearningProgress(
              JSON.stringify(change(snapshot.progress)),
            );
            await storage.write(JSON.stringify(next));
            publish({ progress: next });
          } catch {
            const message =
              "Не удалось сохранить прогресс обучения. Повторите действие.";
            publish({ error: message });
            throw new Error(message);
          } finally {
            publish({ saving: false });
          }
        });
      queue = task;
      return task;
    },
  };
}
