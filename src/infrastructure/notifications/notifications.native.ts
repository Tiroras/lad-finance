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
import { reminderPlan } from "../../domain/reminders";
import type { FinanceState } from "../../domain/types";
import type { FinanceProfile } from "../../domain/profiles";
import { readPaymentNotification, reminderChanges } from "./notificationPlan";
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
export async function requestReminderPermission() {
  await prepareChannel();
  const existing = await getPermissionsAsync();
  return permitted(existing) || permitted(await requestPermissionsAsync());
}

let queue: Promise<unknown> = Promise.resolve();
export async function clearPaymentNotifications() {
  await queue.catch(() => undefined);
  const changes = reminderChanges(
    [],
    await getAllScheduledNotificationsAsync(),
    "personal",
  );
  for (const identifier of changes.cancel)
    await cancelScheduledNotificationAsync(identifier);
  if (
    getLastNotificationResponse()?.notification.request.content.data?.source ===
    "lad"
  )
    await clearLastNotificationResponseAsync();
}

export function synchronizeReminders(
  state: FinanceState,
  profile: FinanceProfile,
): Promise<ReminderStatus> {
  const task = queue
    .catch(() => undefined)
    .then(async (): Promise<ReminderStatus> => {
      await prepareChannel();
      const enabled = state.settings.reminders?.enabled ?? false;
      const allowed = enabled && permitted(await getPermissionsAsync());
      const plan = allowed
        ? reminderPlan(state)
        : { items: [], truncated: false };
      const changes = reminderChanges(
        plan.items,
        await getAllScheduledNotificationsAsync(),
        profile,
      );
      for (const identifier of changes.cancel) {
        await cancelScheduledNotificationAsync(identifier);
      }
      for (const item of changes.schedule) {
        await scheduleNotificationAsync({
          identifier: item.id,
          content: {
            title: "Лад · проверьте план",
            body: item.paymentId
              ? "Приближается запланированный платёж. Откройте Лад, чтобы посмотреть детали."
              : "В плане остались неоплаченные платежи. Отметьте оплату или пропустите ненужные.",
            data: {
              source: "lad",
              profile,
              at: item.at,
              paymentId: item.paymentId ?? null,
              date: item.date ?? null,
              versionId: item.versionId ?? null,
            },
          },
          trigger: {
            type: SchedulableTriggerInputTypes.DATE,
            date: new Date(item.at),
            channelId: CHANNEL,
          },
        });
      }
      return {
        status: !enabled ? "off" : allowed ? "ready" : "denied",
        count: plan.items.length,
        truncated: plan.truncated,
      };
    });
  queue = task;
  return task;
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
