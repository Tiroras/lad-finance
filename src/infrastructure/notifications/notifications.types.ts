import type { FinanceProfile } from "../../domain/profiles";

export type ReminderStatus = {
  profile: FinanceProfile;
} & (
  | {
      status: "ready";
      count: number;
      truncated: boolean;
      syncedAt: number;
      windowEnd: string;
      lastNotificationAt?: number;
      firstOmittedAt?: number;
    }
  | {
      status: "off";
      count: 0;
      truncated: false;
      syncedAt: number;
      windowEnd: string;
    }
  | {
      status: "denied";
      count: 0;
      truncated: false;
      syncedAt: number;
      windowEnd: string;
      deniedReason: "permission" | "channel";
    }
  | {
      status: "unsupported";
      count: null;
      truncated: false;
    }
  | {
      status: "error";
      count: number | null;
      truncated: boolean;
      error: string;
      lastNotificationAt?: number;
      firstOmittedAt?: number;
      windowEnd?: string;
    }
);
export interface PaymentNotification {
  profile: FinanceProfile;
  paymentId?: string;
  date?: string;
  versionId?: string;
  creditAccountId?: string;
}
