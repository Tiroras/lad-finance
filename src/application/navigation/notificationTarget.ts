import { resolvePaymentOccurrence } from "../../domain/payments";
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
  const { paymentId, date, versionId } = notification;
  const plan = state.recurring.find((item) => item.id === paymentId);
  return {
    tab: "plan",
    sheet:
      paymentId &&
      date &&
      plan &&
      resolvePaymentOccurrence(plan, date, versionId)
        ? {
            type: "payment",
            id: paymentId,
            date,
            ...(versionId ? { versionId } : {}),
          }
        : null,
  };
}
