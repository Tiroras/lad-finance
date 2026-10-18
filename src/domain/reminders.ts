import { localDate, overduePayments, shiftDate, upcoming } from "./finance";
import type { FinanceState, ReminderPreferences } from "./types";

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

// One-off local dates handle short months correctly. Keep below iOS's pending
// notification limit; replenish the horizon whenever the app becomes active.
export function reminderPlan(state: FinanceState, now = new Date()) {
  const preferences = state.settings.reminders ?? DEFAULT_REMINDERS;
  if (!preferences.enabled)
    return { items: [] as PlannedReminder[], truncated: false };
  const today = localDate(now);
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
    if (at > now.getTime())
      items.push({
        id: `lad.credit-terms.${account.id}.${account.creditTermsReminderDate}`,
        at,
        creditAccountId: account.id,
        date: account.creditTermsReminderDate,
      });
  }
  for (const { payment, date, versionId, paid, skipped } of upcoming(
    state,
    today,
    shiftDate(today, 61),
  )) {
    if (paid || skipped) continue;
    let at = atHour(shiftDate(date, -preferences.daysBefore));
    // If the advance reminder has passed, still remind on the due date.
    if (at <= now.getTime()) at = atHour(date);
    if (at > now.getTime())
      items.push({
        id: `lad.payment.${payment.id}.${versionId ?? "legacy"}.${date}`,
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
      if (at > now.getTime()) items.push({ id: `lad.overdue.${date}`, at });
    }
  }
  items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return { items: items.slice(0, 60), truncated: items.length > 60 };
}
