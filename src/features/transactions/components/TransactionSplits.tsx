import { View } from "react-native";
import type { CurrencyCode } from "../../../domain/currency";
import { uid } from "../../../domain/finance";
import { Button, Card, Field, Notice, Txt } from "../../../shared/ui";
import { useMoney } from "../../../state/finance";
import { CategoryPicker } from "../../categories";

export interface SplitDraft {
  key: string;
  category: string;
  amount: string;
}

export function TransactionSplits({
  enabled,
  parts,
  currency,
  total,
  onToggle,
  onChange,
}: {
  enabled: boolean;
  parts: SplitDraft[];
  currency: CurrencyCode;
  total: number | null;
  onToggle: () => void;
  onChange: (parts: SplitDraft[]) => void;
}) {
  const { money, parseMoney } = useMoney();
  const allocated = parts.reduce(
    (sum, part) => sum + (parseMoney(part.amount, currency) ?? 0),
    0,
  );
  return (
    <View style={{ gap: 12 }}>
      <Button
        label={
          enabled
            ? "Одна категория для покупки"
            : "Разделить покупку по категориям"
        }
        variant="secondary"
        onPress={onToggle}
      />
      {enabled && (
        <>
          <Notice>
            Части — детализация одной покупки. Общая сумма спишется со счёта
            один раз. Осталось распределить:{" "}
            {money((total ?? 0) - allocated, true, currency)}.
          </Notice>
          {parts.map((part, index) => (
            <Card key={part.key} style={{ gap: 10 }}>
              <Txt>Часть {index + 1}</Txt>
              <CategoryPicker
                value={part.category}
                onChange={(category) =>
                  onChange(
                    parts.map((entry) =>
                      entry.key === part.key ? { ...entry, category } : entry,
                    ),
                  )
                }
              />
              <Field
                label={`Сумма части, ${currency}`}
                accessibilityLabel={`Сумма части ${index + 1}`}
                value={part.amount}
                onChangeText={(amount) =>
                  onChange(
                    parts.map((entry) =>
                      entry.key === part.key ? { ...entry, amount } : entry,
                    ),
                  )
                }
                keyboardType="decimal-pad"
                maxLength={16}
              />
              {parts.length > 2 && (
                <Button
                  label={`Убрать часть ${index + 1}`}
                  variant="secondary"
                  onPress={() =>
                    onChange(parts.filter((entry) => entry.key !== part.key))
                  }
                />
              )}
            </Card>
          ))}
          {parts.length < 50 && (
            <Button
              label="Добавить часть покупки"
              variant="secondary"
              onPress={() =>
                onChange([
                  ...parts,
                  { key: uid(), category: "other", amount: "" },
                ])
              }
            />
          )}
        </>
      )}
    </View>
  );
}
