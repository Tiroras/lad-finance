import { ExchangeRateProvider } from "../../features/currencies";
import { FinanceProvider } from "../../state/finance";
import { ReminderProvider } from "../../features/payments";
import { SecurityProvider } from "../../features/security";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SecurityProvider>
      <FinanceProvider>
        <ReminderProvider>
          <ExchangeRateProvider>{children}</ExchangeRateProvider>
        </ReminderProvider>
      </FinanceProvider>
    </SecurityProvider>
  );
}
