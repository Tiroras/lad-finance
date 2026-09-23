import { useState } from "react";
import { Pressable, View } from "react-native";
import type { CsvOverride, CsvPreviewRow } from "../../../domain/csv";
import { accountCurrency } from "../../../domain/currency";
import { AccountPicker } from "../../accounts";
import { CategoryRuleSuggestion } from "../../transactions";
import { CategoryPicker } from "../../categories";
import { useMoney, useFinance } from "../../../state/finance";
import {
  C,
  Card,
  Chip,
  font,
  Icon,
  Notice,
  Row,
  Segments,
  Txt,
  AmountField,
} from "../../../shared/ui";

export function CsvRowItem({
  row,
  included,
  accountId,
  override,
  onToggle,
  onOverride,
}: {
  row: CsvPreviewRow;
  included: boolean;
  accountId: string;
  override?: CsvOverride;
  onToggle: () => void;
  onOverride: (value: CsvOverride) => void;
}) {
  const { money } = useMoney();
  const { state } = useFinance();
  const [editing, setEditing] = useState(false);
  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <Row>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Импортировать строку ${row.line}`}
          accessibilityState={{
            checked: included,
            disabled: !!row.error || row.duplicate,
          }}
          disabled={!!row.error || row.duplicate}
          onPress={onToggle}
          style={{ padding: 6 }}
        >
          <Icon
            name={included ? "checkbox" : "square-outline"}
            color={included ? C.green : C.muted}
          />
        </Pressable>
        <View style={{ flex: 1, gap: 5 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 12 }}>
            {row.title || `Строка ${row.line}`}
          </Txt>
          <Txt style={{ color: C.muted, fontSize: 10 }}>
            Строка {row.line}
            {row.transaction
              ? ` · ${row.transaction.date} · ${row.transaction.type === "income" ? "Доход" : row.transaction.type === "expense" ? "Расход" : "Перевод"}`
              : ""}
          </Txt>
        </View>
        {row.transaction && (
          <Txt style={{ fontFamily: font.bold, fontSize: 12 }}>
            {money(
              row.transaction.amount,
              true,
              accountCurrency(state, row.transaction.accountId),
            )}
          </Txt>
        )}
      </Row>
      {!!row.categoryReason && <Notice>{row.categoryReason}</Notice>}
      {!!row.error && <Notice tone="warning">{row.error}</Notice>}
      {row.duplicate && (
        <Txt style={{ fontSize: 11, color: C.muted }}>
          Совпадает с существующей записью или ID в файле — пропускаем.
        </Txt>
      )}
      {!row.duplicate && (
        <Chip
          label={
            editing
              ? `Свернуть строку ${row.line}`
              : `Уточнить строку ${row.line}`
          }
          onPress={() => setEditing(!editing)}
        />
      )}
      {editing &&
        row.transaction?.type === "expense" &&
        !!override?.category && (
          <CategoryRuleSuggestion
            title={row.title}
            category={override.category}
          />
        )}
      {editing && (
        <>
          <Segments
            value={override?.type ?? row.transaction?.type ?? "expense"}
            options={[
              { value: "expense", label: "Расход" },
              { value: "income", label: "Доход" },
              { value: "transfer", label: "Перевод" },
            ]}
            onChange={(type) => onOverride({ ...override, type })}
          />
          {override?.type === "transfer" ? (
            <>
              <AccountPicker
                label="Второй ваш счёт"
                selected={override.otherAccountId ?? ""}
                exclude={accountId}
                onChange={(otherAccountId) =>
                  onOverride({
                    ...override,
                    otherAccountId,
                    otherAmount: undefined,
                  })
                }
              />
              {override.otherAccountId &&
                accountCurrency(state, accountId) !==
                  accountCurrency(state, override.otherAccountId) && (
                  <AmountField
                    label={`Сумма на втором счёте, ${accountCurrency(state, override.otherAccountId)}`}
                    accessibilityLabel={`Сумма второго счёта строки ${row.line}`}
                    value={override.otherAmount ?? ""}
                    onChangeText={(otherAmount) =>
                      onOverride({ ...override, otherAmount })
                    }
                  />
                )}
              <Txt style={{ fontSize: 11, color: C.muted }}>
                Знак суммы задаёт направление: расход из счёта выписки или
                приход на него. Перевод из накоплений запишите отдельно.
              </Txt>
            </>
          ) : (
            <CategoryPicker
              value={override?.category ?? row.transaction?.category ?? "other"}
              onChange={(category) => onOverride({ ...override, category })}
            />
          )}
        </>
      )}
    </Card>
  );
}
