import { useState } from "react";
import { View } from "react-native";
import type { OpenSheet } from "../../../application/navigation/types";
import { debtBalance } from "../../../domain/debts";
import { useFinance } from "../../../state/finance";
import { Button, Notice, Section } from "../../../shared/ui";
import { CreditCardOverview } from "./CreditCardOverview";
import { DebtCard } from "./DebtCard";

export function DebtsPanel({ open }: { open: OpenSheet }) {
  const { state, today } = useFinance();
  const [showClosed, setShowClosed] = useState(false);
  const debts = state.debts ?? [];
  const closed = debts.filter((debt) => debtBalance(state, debt, today) === 0);
  return (
    <View style={{ gap: 16 }}>
      <Section title="Долги и кредитные карты" />
      <Notice>
        Выдача и возврат основной суммы учитываются отдельно от расходов и
        доходов. Ваши долги со сроком и заданные платежи по картам входят в
        прогноз. Ожидаемые возвраты вам появятся в доступных деньгах только
        после получения.
      </Notice>
      <Button
        label="Добавить долг"
        icon="add"
        onPress={() => open({ type: "debt" })}
      />
      {debts
        .filter((debt) => showClosed || debtBalance(state, debt, today) > 0)
        .map((debt) => (
          <DebtCard key={debt.id} debt={debt} open={open} />
        ))}
      {closed.length > 0 && (
        <Button
          variant="secondary"
          label={
            showClosed
              ? "Скрыть закрытые долги"
              : `Закрытые долги: ${closed.length}`
          }
          onPress={() => setShowClosed(!showClosed)}
        />
      )}
      <Button
        label="Добавить кредитную карту"
        variant="secondary"
        icon="card-outline"
        onPress={() => open({ type: "account", accountKind: "credit" })}
      />
      {state.accounts
        .filter((account) => !account.archived && account.kind === "credit")
        .map((account) => (
          <CreditCardOverview key={account.id} account={account} open={open} />
        ))}
    </View>
  );
}
