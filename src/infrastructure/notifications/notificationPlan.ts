import type { PlannedReminder } from "../../domain/reminders";
import { isFinanceProfile, type FinanceProfile } from "../../domain/profiles";
import type { PaymentNotification } from "./notifications.types";

export function readPaymentNotification(
  data: Record<string, unknown> | undefined,
): PaymentNotification | undefined {
  if (data?.source !== "lad" || !isFinanceProfile(data.profile))
    return undefined;
  return {
    profile: data.profile,
    paymentId: typeof data.paymentId === "string" ? data.paymentId : undefined,
    date: typeof data.date === "string" ? data.date : undefined,
  };
}

export function reminderChanges(
  items: PlannedReminder[],
  existing: {
    identifier: string;
    content: { data?: Record<string, unknown> };
  }[],
  profile: FinanceProfile,
) {
  const wanted = new Map(
    items.map((item) => {
      const id = item.id.replace(/^lad\./, `lad.${profile}.`);
      return [id, { ...item, id }];
    }),
  );
  const cancel: string[] = [];
  for (const item of existing) {
    if (!item.identifier.startsWith("lad.")) continue;
    const reminder = wanted.get(item.identifier);
    if (
      !reminder ||
      item.content.data?.profile !== profile ||
      reminder.at !== item.content.data?.at
    ) {
      cancel.push(item.identifier);
    } else {
      wanted.delete(item.identifier);
    }
  }
  return { cancel, schedule: [...wanted.values()] };
}
