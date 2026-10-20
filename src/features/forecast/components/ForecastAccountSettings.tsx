import { View } from "react-native";
import type { ForecastPreferences } from "../../../domain/types";
import { accountCurrency } from "../../../domain/currency";
import { useFinance } from "../../../state/finance";
import { Card, Notice, SelectField, Txt } from "../../../shared/ui";

export function ForecastAccountSettings({
  value,
  onChange,
}: {
  value: ForecastPreferences;
  onChange: (value: ForecastPreferences) => void;
}) {
  const { state } = useFinance();
  const options = (kind: "spending" | "savings", currency?: string) => [
    { value: "", label: "Не назначен" },
    ...state.accounts
      .filter(
        (account) =>
          !account.archived &&
          account.kind === kind &&
          (!currency || (account.currency ?? "RUB") === currency),
      )
      .map((account) => ({
        value: account.id,
        label: `${account.name} · ${account.currency ?? "RUB"}`,
      })),
  ];
  const repayments = [
    ...state.accounts
      .filter((account) => account.kind === "credit" && !account.archived)
      .map((account) => ({
        kind: "credit" as const,
        id: account.id,
        name: account.name,
        currency: account.currency ?? "RUB",
      })),
    ...(state.debts ?? [])
      .filter((debt) => debt.direction === "borrowed")
      .map((debt) => ({
        kind: "debt" as const,
        id: debt.id,
        name: debt.name,
        currency: accountCurrency(state, debt.accountId),
      })),
  ];
  return (
    <View style={{ gap: 18 }}>
      <Notice>
        Назначьте счета для прогноза. Неназначенные расходы остаются в общей
        сумме, но до назначения нельзя подтвердить достаточность отдельного
        счёта. Назначения не создают операции.
      </Notice>
      <SelectField
        label="Счёт повседневных расходов"
        value={value.dailyAccountId ?? ""}
        options={options("spending")}
        onChange={(dailyAccountId) =>
          onChange({ ...value, dailyAccountId: dailyAccountId || undefined })
        }
      />
      {state.goals.map((goal) => {
        const assignment = value.goalAccounts?.find(
          (entry) => entry.goalId === goal.id,
        );
        const update = (patch: {
          fromAccountId?: string;
          toAccountId?: string;
        }) =>
          onChange({
            ...value,
            goalAccounts: [
              ...(value.goalAccounts ?? []).filter(
                (entry) => entry.goalId !== goal.id,
              ),
              {
                goalId: goal.id,
                fromAccountId: assignment?.fromAccountId ?? "",
                toAccountId: assignment?.toAccountId ?? "",
                ...patch,
              },
            ],
          });
        return (
          <Card key={goal.id} style={{ gap: 12 }}>
            <Txt>Цель: {goal.name}</Txt>
            <SelectField
              label={`Откуда взнос: ${goal.name}`}
              value={assignment?.fromAccountId ?? ""}
              options={options("spending", goal.currency ?? "RUB")}
              onChange={(fromAccountId) => update({ fromAccountId })}
            />
            <SelectField
              label={`Куда взнос: ${goal.name}`}
              value={assignment?.toAccountId ?? ""}
              options={options("savings", goal.currency ?? "RUB")}
              onChange={(toAccountId) => update({ toAccountId })}
            />
          </Card>
        );
      })}
      {repayments.map((repayment) => (
        <SelectField
          key={`${repayment.kind}:${repayment.id}`}
          label={`Счёт погашения: ${repayment.name}`}
          value={
            value.repaymentAccounts?.find(
              (entry) =>
                entry.kind === repayment.kind &&
                entry.sourceId === repayment.id,
            )?.accountId ?? ""
          }
          options={options("spending", repayment.currency)}
          onChange={(accountId) =>
            onChange({
              ...value,
              repaymentAccounts: [
                ...(value.repaymentAccounts ?? []).filter(
                  (entry) =>
                    entry.kind !== repayment.kind ||
                    entry.sourceId !== repayment.id,
                ),
                ...(accountId
                  ? [
                      {
                        kind: repayment.kind,
                        sourceId: repayment.id,
                        accountId,
                      },
                    ]
                  : []),
              ],
            })
          }
        />
      ))}
    </View>
  );
}
