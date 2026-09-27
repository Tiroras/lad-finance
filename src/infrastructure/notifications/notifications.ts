import type { FinanceState } from "../../domain/types";
import type { FinanceProfile } from "../../domain/profiles";
import type {
  PaymentNotification,
  ReminderStatus,
} from "./notifications.types";

export async function requestReminderPermission() {
  return false;
}
export async function clearPaymentNotifications() {}
export async function synchronizeReminders(
  _state: FinanceState,
  _profile: FinanceProfile,
): Promise<ReminderStatus> {
  return { status: "unsupported", count: 0, truncated: false };
}
export function observePaymentNotifications(
  _callback: (data: PaymentNotification) => void,
) {
  return () => {};
}
