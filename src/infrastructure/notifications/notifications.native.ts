import { Platform } from "react-native";
import type * as Notifications from "expo-notifications";
// SDK 57's entrypoint starts push-token registration, which crashes Android Expo Go.
// Load only the modules needed for local reminders.
import { cancelScheduledNotificationAsync } from "expo-notifications/build/cancelScheduledNotificationAsync";
import { getAllScheduledNotificationsAsync } from "expo-notifications/build/getAllScheduledNotificationsAsync";
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-notifications/build/NotificationPermissions";
import { IosAuthorizationStatus } from "expo-notifications/build/NotificationPermissions.types";
import {
  AndroidImportance,
  AndroidNotificationVisibility,
} from "expo-notifications/build/NotificationChannelManager.types";
import {
  addNotificationResponseReceivedListener,
  clearLastNotificationResponseAsync,
  getLastNotificationResponse,
} from "expo-notifications/build/NotificationsEmitter";
import { setNotificationHandler } from "expo-notifications/build/NotificationsHandler";
import { SchedulableTriggerInputTypes } from "expo-notifications/build/Notifications.types";
import { scheduleNotificationAsync } from "expo-notifications/build/scheduleNotificationAsync";
import { setNotificationChannelAsync } from "expo-notifications/build/setNotificationChannelAsync";
import { getNotificationChannelAsync } from "expo-notifications/build/getNotificationChannelAsync";
import type { PlannedReminder } from "../../domain/reminders";
import type { FinanceState } from "../../domain/types";
import type { FinanceProfile } from "../../domain/profiles";
import { readPaymentNotification, reminderData } from "./notificationPlan";
import {
  createReminderSynchronizer,
  type ReminderAccess,
} from "./reminderSynchronizer";
import type {
  PaymentNotification,
  ReminderStatus,
} from "./notifications.types";

const CHANNEL = "lad-payments";
setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
async function prepareChannel() {
  if (Platform.OS === "android")
    await setNotificationChannelAsync(CHANNEL, {
      name: "Напоминания о платежах",
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
}
function permitted(value: Notifications.NotificationPermissionsStatus) {
  return (
    value.granted || value.ios?.status === IosAuthorizationStatus.PROVISIONAL
  );
}
async function channelAllowed() {
  if (Platform.OS !== "android" || Number(Platform.Version) < 26) return true;
  const channel = await getNotificationChannelAsync(CHANNEL);
  if (!channel) throw new Error("Канал напоминаний недоступен.");
  return channel.importance !== AndroidImportance.NONE;
}
async function reminderAccess(): Promise<ReminderAccess> {
  await prepareChannel();
  if (!permitted(await getPermissionsAsync())) return "permission";
  return (await channelAllowed()) ? "allowed" : "channel";
}
export async function requestReminderPermission() {
  await prepareChannel();
  const existing = await getPermissionsAsync();
  const allowed =
    permitted(existing) || permitted(await requestPermissionsAsync());
  return allowed && (await channelAllowed());
}

function trigger(
  item: PlannedReminder,
): Notifications.NotificationTriggerInput {
  const date = new Date(item.at);
  // SDK 57 converts iOS DATE to a time interval whose readback has no absolute
  // date. A full UTC calendar trigger stays one-off and can be verified exactly.
  if (Platform.OS === "ios")
    return {
      type: SchedulableTriggerInputTypes.CALENDAR,
      repeats: false,
      timezone: "UTC",
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  return {
    type: SchedulableTriggerInputTypes.DATE,
    date,
    channelId: CHANNEL,
  };
}

const synchronizer = createReminderSynchronizer({
  access: reminderAccess,
  read: getAllScheduledNotificationsAsync,
  cancel: cancelScheduledNotificationAsync,
  schedule: (item, profile) =>
    scheduleNotificationAsync({
      identifier: item.id,
      content: {
        title: "Лад · проверьте план",
        body: item.creditAccountId
          ? "Пора сверить условия кредитной карты с выпиской. Откройте Лад, чтобы обновить сумму и срок."
          : item.paymentId
            ? "Приближается запланированный платёж. Откройте Лад, чтобы посмотреть детали."
            : "В плане остались неоплаченные платежи. Отметьте оплату или пропустите ненужные.",
        data: reminderData(item, profile),
      },
      trigger: trigger(item),
    }),
  clearResponse: async () => {
    if (
      getLastNotificationResponse()?.notification.request.content.data
        ?.source === "lad"
    )
      await clearLastNotificationResponseAsync();
  },
  now: () => new Date(),
});

export function clearPaymentNotifications() {
  return synchronizer.clear();
}

export function synchronizeReminders(
  state: FinanceState,
  profile: FinanceProfile,
): Promise<ReminderStatus> {
  return synchronizer.synchronize(state, profile);
}

export function observePaymentNotifications(
  callback: (data: PaymentNotification) => void,
) {
  const handle = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (data?.source !== "lad") return;
    const notification = readPaymentNotification(data);
    if (notification) callback(notification);
    void clearLastNotificationResponseAsync().catch(() => undefined);
  };
  const last = getLastNotificationResponse();
  if (last) handle(last);
  const listener = addNotificationResponseReceivedListener(handle);
  return () => listener.remove();
}
