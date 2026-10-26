import AsyncStorage from "@react-native-async-storage/async-storage";

export const LEARNING_PROGRESS_KEY = "lad-learning-progress-v1";
const KEY = LEARNING_PROGRESS_KEY;
export const readLearningProgress = () => AsyncStorage.getItem(KEY);
export const writeLearningProgress = (raw: string) =>
  AsyncStorage.setItem(KEY, raw);
