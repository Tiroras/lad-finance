import type { FinanceState } from "../../domain/types";
import type { PaymentNotification } from "../../infrastructure/notifications/notifications.types";
import type { FinanceProfile } from "../../infrastructure/storage/profileStorage";
import type { SheetState } from "./types";

export function notificationTarget(
  notification: PaymentNotification,
  profile: FinanceProfile,
  state: FinanceState,
): { tab: "plan"; sheet: SheetState | null } | null {
  if (notification.profile !== profile) return null;
  const { paymentId, date } = notification;
  return {
    tab: "plan",
    sheet:
      paymentId && date && state.recurring.some((item) => item.id === paymentId)
        ? { type: "payment", id: paymentId, date }
        : null,
  };
}
