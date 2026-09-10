export interface ReminderStatus {
  status: "off" | "ready" | "denied" | "unsupported";
  count: number;
  truncated: boolean;
}
export interface PaymentNotification {
  paymentId?: string;
  date?: string;
}
