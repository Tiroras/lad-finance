export interface ReminderStatus {
  status: "off" | "ready" | "denied" | "unsupported";
  count: number;
  truncated: boolean;
}
export interface PaymentNotification {
  profile: FinanceProfile;
  paymentId?: string;
  date?: string;
  versionId?: string;
  creditAccountId?: string;
}
import type { FinanceProfile } from "../../domain/profiles";
