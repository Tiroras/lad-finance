import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "lad-learning-progress-v1";
export const readLearningProgress = () => AsyncStorage.getItem(KEY);
export const writeLearningProgress = (raw: string) =>
  AsyncStorage.setItem(KEY, raw);
