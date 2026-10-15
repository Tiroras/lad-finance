import { View } from "react-native";
import type { FinanceSnapshotSummary } from "../../../domain/dataTransfer";
import { dateLabel } from "../../../domain/finance";
import { useMoney } from "../../../state/finance";
import { C, Card, Section, Txt } from "../../../shared/ui";

const labels: Record<keyof FinanceSnapshotSummary["counts"], string> = {
  accounts: "Счета",
  transactions: "Операции",
  categories: "Категории",
  goals: "Цели",
  recurring: "Планы платежей",
  plannedIncomes: "Планы доходов",
  scenarios: "Сценарии",
  debts: "Долги",
  budgetPlans: "Бюджетные планы",
  balanceAdjustments: "Корректировки остатков",
  reconciliations: "Сверки",
  categoryRules: "Правила категорий",
  transactionTemplates: "Шаблоны операций",
  csvProfiles: "Профили CSV",
};

export function ImportSnapshotSummary({
  title,
  snapshot,
  balances = true,
}: {
  title: string;
  snapshot: FinanceSnapshotSummary;
  balances?: boolean;
}) {
  const { money } = useMoney();
  return (
    <Card style={{ gap: 12 }}>
      <Section title={title} />
      <Txt>
        {(Object.keys(labels) as (keyof typeof labels)[])
          .filter(
            (key) =>
              ["accounts", "transactions", "goals"].includes(key) ||
              snapshot.counts[key] > 0,
          )
          .map((key) => `${labels[key]}: ${snapshot.counts[key]}`)
          .join(" · ")}
      </Txt>
      {balances && (
        <>
          <Txt style={{ color: C.muted }}>
            Остатки на {dateLabel(snapshot.asOf)} по снимку этой операции:
          </Txt>
          {snapshot.balances.map((account) => (
            <View key={account.accountId} style={{ gap: 3 }}>
              <Txt>{account.name}</Txt>
              <Txt>{money(account.balance, true, account.currency)}</Txt>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}
