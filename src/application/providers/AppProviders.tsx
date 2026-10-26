import { ExchangeRateProvider } from "../../features/currencies";
import { FinanceProvider } from "../../state/finance";
import { ReminderProvider } from "../../features/payments";
import { SecurityProvider } from "../../features/security";
import type { ReactNode } from "react";
import type { DataDeletionRequest } from "../../domain/profiles";

export function AppProviders({
  children,
  onDeleteData,
}: {
  children: ReactNode;
  onDeleteData: (request: DataDeletionRequest) => void;
}) {
  return (
    <SecurityProvider>
      <FinanceProvider onDeleteData={onDeleteData}>
        <ReminderProvider>
          <ExchangeRateProvider>{children}</ExchangeRateProvider>
        </ReminderProvider>
      </FinanceProvider>
    </SecurityProvider>
  );
}
