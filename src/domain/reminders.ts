import { localDate, overduePayments, shiftDate, upcoming } from "./finance";
import { paymentOccurrenceKey } from "./payments";
import type { FinanceState, ReminderPreferences } from "./types";

export const REMINDER_LIMIT = 60;
export const REMINDER_WINDOW_DAYS = 60;
export const DEFAULT_REMINDERS: ReminderPreferences = {
  enabled: false,
  daysBefore: 1,
  hour: 9,
};
export interface PlannedReminder {
  id: string;
  at: number;
  paymentId?: string;
  date?: string;
  versionId?: string;
  creditAccountId?: string;
}
export interface ReminderPlan {
  items: PlannedReminder[];
  truncated: boolean;
  /** Inclusive last local calendar day; a truncated queue may end earlier. */
  windowEnd: string;
  firstOmittedAt?: number;
}

// One-off local dates handle short months correctly. The shared app cap is not
// an OS delivery guarantee; replenish the horizon when the app becomes active.
export function reminderPlan(
  state: FinanceState,
  now = new Date(),
): ReminderPlan {
  const preferences = state.settings.reminders ?? DEFAULT_REMINDERS;
  const today = localDate(now);
  const windowEnd = shiftDate(today, REMINDER_WINDOW_DAYS - 1);
  if (!preferences.enabled) return { items: [], truncated: false, windowEnd };
  const end = new Date(
    `${shiftDate(today, REMINDER_WINDOW_DAYS)}T00:00:00`,
  ).getTime();
  const inWindow = (at: number) => at > now.getTime() && at < end;
  const atHour = (date: string) =>
    new Date(
      `${date}T${String(preferences.hour).padStart(2, "0")}:00:00`,
    ).getTime();
  const items: PlannedReminder[] = [];
  for (const account of state.accounts) {
    if (
      account.kind !== "credit" ||
      account.archived ||
      !account.creditTermsReminderDate
    )
      continue;
    const at = atHour(account.creditTermsReminderDate);
    if (inWindow(at))
      items.push({
        id: `lad.credit-terms.${encodeURIComponent(JSON.stringify([account.id, account.creditTermsReminderDate]))}`,
        at,
        creditAccountId: account.id,
        date: account.creditTermsReminderDate,
      });
  }
  for (const { payment, date, versionId, paid, skipped } of upcoming(
    state,
    today,
    shiftDate(today, REMINDER_WINDOW_DAYS + preferences.daysBefore),
  )) {
    if (paid || skipped) continue;
    let at = atHour(shiftDate(date, -preferences.daysBefore));
    // If the advance reminder has passed, still remind on the due date.
    if (at <= now.getTime()) at = atHour(date);
    if (inWindow(at))
      items.push({
        id: `lad.payment.${encodeURIComponent(JSON.stringify([payment.id, paymentOccurrenceKey(payment, date, versionId)]))}`,
        at,
        paymentId: payment.id,
        date,
        versionId,
      });
  }
  if (overduePayments(state, today).length) {
    for (let offset = 0; offset < 7; offset++) {
      const date = shiftDate(today, offset),
        at = atHour(date);
      if (inWindow(at)) items.push({ id: `lad.overdue.${date}`, at });
    }
  }
  items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return {
    items: items.slice(0, REMINDER_LIMIT),
    truncated: items.length > REMINDER_LIMIT,
    windowEnd,
    ...(items[REMINDER_LIMIT]
      ? { firstOmittedAt: items[REMINDER_LIMIT].at }
      : {}),
  };
}
