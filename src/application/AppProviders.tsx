import { FinanceProvider } from "../store";
import { ReminderProvider } from "../features/payments/ReminderProvider";
import { SecurityProvider } from "../security/SecurityProvider";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SecurityProvider>
      <FinanceProvider>
        <ReminderProvider>{children}</ReminderProvider>
      </FinanceProvider>
    </SecurityProvider>
  );
}
