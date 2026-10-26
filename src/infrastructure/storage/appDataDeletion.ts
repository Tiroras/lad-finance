import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDataDeletion } from "./dataDeletion";
import { profileRecoveryStorage, readProfiles } from "./profileStorage";
import { LEARNING_PROGRESS_KEY } from "./learningStorage";
import { resetDeviceData } from "./resetDeviceData";

export const appDataDeletion = createDataDeletion({
  storage: AsyncStorage,
  profiles: readProfiles,
  ...profileRecoveryStorage,
  clearLearning: () => AsyncStorage.removeItem(LEARNING_PROGRESS_KEY),
  resetDevice: resetDeviceData,
});
