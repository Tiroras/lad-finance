import type { FinanceState } from "../../domain/types";
import type {
  PaymentNotification,
  ReminderStatus,
} from "./notifications.types";

export async function requestReminderPermission() {
  return false;
}
export async function synchronizeReminders(
  _state: FinanceState,
): Promise<ReminderStatus> {
  return { status: "unsupported", count: 0, truncated: false };
}
export function observePaymentNotifications(
  _callback: (data: PaymentNotification) => void,
) {
  return () => {};
}
