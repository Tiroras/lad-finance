import { accountToBase } from "../../../domain/currency";
import { PaymentAgenda } from "./PaymentAgenda";
import type { OpenSheet } from "../../../application/navigation/types";
import { useFinance } from "../../../state/finance";
import { RecurringPaymentsList } from "./RecurringPaymentsList";
import { PaymentsSummary } from "./PaymentsSummary";
import { shiftDate } from "../../../shared/lib/dates";
import { upcoming } from "../../../domain/payments";

export function PaymentsPanel({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const payments = upcoming(state, today, shiftDate(today, 365)).filter(
    (o) => !o.paid && !o.skipped,
  );
  const sum = (days: number) =>
    payments
      .filter((o) => o.date < shiftDate(today, days))
      .reduce(
        (total, { payment }) =>
          total + accountToBase(state, payment.amount, payment.accountId),
        0,
      );
  return (
    <>
      <PaymentAgenda open={open} />
      <PaymentsSummary monthly={sum(30)} yearly={sum(365)} />
      <RecurringPaymentsList open={open} />
    </>
  );
}
