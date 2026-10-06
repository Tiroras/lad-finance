import { useEffect, useSyncExternalStore } from "react";
import {
  readLearningProgress,
  writeLearningProgress,
} from "../../../infrastructure/storage/learningStorage";
import { createLearningProgressStore } from "./learningProgress";

const store = createLearningProgressStore({
  read: readLearningProgress,
  write: writeLearningProgress,
});
const skip = () => store.update((value) => ({ ...value, status: "skipped" }));

export function useLearningProgress() {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => {
    void store.load().catch(() => undefined);
  }, []);
  return { ...snapshot, update: store.update, retry: store.load, skip };
}
