import { View } from "react-native";
import { accountCurrency } from "../../../domain/currency";
import { recurringSuggestions } from "../../../domain/insights";
import { useFinance, useMoney } from "../../../state/finance";
import {
  Button,
  C,
  Card,
  font,
  Notice,
  Section,
  Txt,
} from "../../../shared/ui";
import { TransactionEvidence } from "../../transactions";

export function RecurringSuggestions({
  onCreate,
  onOpenTransaction,
}: {
  onCreate: (transactionId: string) => void;
  onOpenTransaction: (id: string) => void;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const suggestions = recurringSuggestions(state, today);
  return (
    <Card>
      <Section title="Повторяющиеся траты" />
      <View style={{ gap: 16 }}>
        <Notice>
          {suggestions.length
            ? "Эти расходы похожи на ежемесячные платежи. Проверьте условия перед добавлением в план: расход автоматически не создаётся."
            : "Пока уверенных совпадений нет. Подсказка появится после трёх похожих платежей подряд: один в месяц, с близкой суммой и датой."}
        </Notice>
        {suggestions.map((suggestion) => (
          <View
            key={suggestion.transactionId}
            style={{
              gap: 12,
              borderTopWidth: 1,
              borderTopColor: C.border,
              paddingTop: 12,
            }}
          >
            <Txt style={{ fontFamily: font.bold, fontSize: 14 }}>
              {suggestion.title} ·{" "}
              {money(
                suggestion.amount,
                false,
                accountCurrency(state, suggestion.accountId),
              )}
            </Txt>
            <TransactionEvidence
              transactions={suggestion.transactions}
              onOpen={onOpenTransaction}
            />
            <Button
              variant="secondary"
              label={`Запланировать: ${suggestion.title}`}
              onPress={() => onCreate(suggestion.transactionId)}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}
