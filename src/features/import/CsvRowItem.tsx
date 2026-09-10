import { useState } from "react";
import { Pressable, View } from "react-native";
import { AccountPicker } from "../../forms/AccountPicker";
import { CategoryPicker } from "../../forms/CategoryPicker";
import type { CsvOverride, CsvPreviewRow } from "../../domain/csv";
import { money } from "../../domain/finance";
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
} from "../../ui";

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
            {money(row.transaction.amount, true)}
          </Txt>
        )}
      </Row>
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
                  onOverride({ ...override, otherAccountId })
                }
              />
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
