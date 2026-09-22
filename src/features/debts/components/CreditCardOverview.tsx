import type { OpenSheet } from "../../../application/navigation/types";
import {
  creditOutstanding,
  creditPaymentRemaining,
} from "../../../domain/debts";
import type { Account } from "../../../domain/types";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import { Button, C, Card, font, Notice, Txt } from "../../../shared/ui";

export function CreditCardOverview({
  account,
  open,
}: {
  account: Account;
  open: OpenSheet;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const outstanding = creditOutstanding(state, account, today);
  const due = creditPaymentRemaining(state, account, today);
  const currency = account.currency ?? "RUB";
  return (
    <Card style={{ gap: 12 }}>
      <Txt style={{ color: C.muted, fontSize: 12 }}>Кредитная карта</Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 18 }}>{account.name}</Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 22 }}>
        Долг: {money(outstanding, false, currency)}
      </Txt>
      <Txt style={{ color: C.muted, fontSize: 12 }}>
        Лимит: {money(account.creditLimit ?? 0, false, currency)} · Не входит в
        деньги для трат
      </Txt>
      {account.paymentDueDate ? (
        <Notice
          tone={
            account.paymentDueDate < today && due > 0 ? "warning" : "normal"
          }
        >
          {due > 0
            ? `Осталось внести ${money(due, false, currency)} до ${dateLabel(account.paymentDueDate)}.`
            : "Указанный обязательный платёж внесён."}{" "}
          Новые условия следующей выписки нужно указать вручную.
        </Notice>
      ) : (
        outstanding > 0 && (
          <Notice tone="warning">
            Укажите обязательный платёж и срок из выписки банка, чтобы включить
            его в прогноз.
          </Notice>
        )
      )}
      {outstanding > 0 && (
        <Button
          label={`Погасить карту: ${account.name}`}
          onPress={() => open({ type: "repayCredit", id: account.id })}
        />
      )}
      <Button
        variant="secondary"
        label={`Условия карты: ${account.name}`}
        onPress={() => open({ type: "account", id: account.id })}
      />
    </Card>
  );
}
