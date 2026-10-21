import type { PlannedReminder } from "../../domain/reminders";
import { isFinanceProfile, type FinanceProfile } from "../../domain/profiles";
import type { PaymentNotification } from "./notifications.types";
import { notificationTriggerAt } from "./notificationTrigger";

export interface ScheduledReminder {
  identifier: string;
  content: { data?: Record<string, unknown> };
  trigger?: unknown;
}

export function reminderData(item: PlannedReminder, profile: FinanceProfile) {
  return {
    source: "lad",
    profile,
    at: item.at,
    paymentId: item.paymentId ?? null,
    date: item.date ?? null,
    versionId: item.versionId ?? null,
    creditAccountId: item.creditAccountId ?? null,
  };
}

export function isLadReminder(item: ScheduledReminder) {
  return item.identifier.startsWith("lad.");
}

function matches(
  item: ScheduledReminder,
  reminder: PlannedReminder,
  profile: FinanceProfile,
) {
  const data = item.content.data;
  const wanted = reminderData(reminder, profile);
  return (
    notificationTriggerAt(item.trigger) === reminder.at &&
    Object.entries(wanted).every(([key, value]) =>
      value === null
        ? data?.[key] === null || data?.[key] === undefined
        : data?.[key] === value,
    )
  );
}

export function readPaymentNotification(
  data: Record<string, unknown> | undefined,
): PaymentNotification | undefined {
  if (data?.source !== "lad" || !isFinanceProfile(data.profile))
    return undefined;
  return {
    profile: data.profile,
    paymentId: typeof data.paymentId === "string" ? data.paymentId : undefined,
    date: typeof data.date === "string" ? data.date : undefined,
    ...(typeof data.versionId === "string"
      ? { versionId: data.versionId }
      : {}),
    ...(typeof data.creditAccountId === "string"
      ? { creditAccountId: data.creditAccountId }
      : {}),
  };
}

export function reminderChanges(
  items: PlannedReminder[],
  existing: ScheduledReminder[],
  profile: FinanceProfile,
) {
  const wanted = new Map(
    items.map((item) => {
      const id = item.id.replace(/^lad\./, `lad.${profile}.`);
      return [id, { ...item, id }];
    }),
  );
  const grouped = new Map<string, ScheduledReminder[]>();
  for (const item of existing) {
    if (!isLadReminder(item)) continue;
    const group = grouped.get(item.identifier) ?? [];
    group.push(item);
    grouped.set(item.identifier, group);
  }
  const cancel: string[] = [];
  for (const [identifier, group] of grouped) {
    const reminder = wanted.get(identifier);
    if (
      !reminder ||
      group.length !== 1 ||
      !matches(group[0], reminder, profile)
    ) {
      cancel.push(identifier);
    } else {
      wanted.delete(identifier);
    }
  }
  return { cancel, schedule: [...wanted.values()] };
}
