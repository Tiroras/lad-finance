import { useState } from "react";
import type { OpenSheet } from "../../../application/navigation/types";
import { View } from "react-native";
import {
  spendingComparison,
  type SpendingChange,
} from "../../../domain/insights";
import { dateLabel } from "../../../shared/lib/dates";
import { useFinance, useMoney } from "../../../state/finance";
import {
  Button,
  C,
  Card,
  font,
  Notice,
  RecordList,
  Section,
  Txt,
} from "../../../shared/ui";
import { TransactionEvidence } from "../../transactions";

function CategoryChange({
  change,
  onOpen,
}: {
  change: SpendingChange;
  onOpen: (id: string) => void;
}) {
  const { money } = useMoney();
  const [expanded, setExpanded] = useState(false);
  return (
    <View
      style={{
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: C.border,
        paddingTop: 16,
      }}
    >
      <Txt style={{ fontFamily: font.bold, fontSize: 14 }}>{change.name}</Txt>
      <Txt style={{ fontSize: 13, lineHeight: 20 }}>
        {change.difference === 0
          ? "Расходы не изменились"
          : `Расходы ${change.difference > 0 ? "выросли" : "снизились"} на ${money(Math.abs(change.difference))}`}
        . Сейчас {money(change.current)}, ранее {money(change.previous)}.
      </Txt>
      <Button
        variant="secondary"
        label={
          expanded
            ? `Скрыть операции: ${change.name}`
            : `Почему: ${change.name}`
        }
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <View style={{ gap: 12 }}>
          <Txt style={{ fontFamily: font.semibold, fontSize: 12 }}>
            Операции выбранного периода
          </Txt>
          <TransactionEvidence
            transactions={change.currentTransactions}
            onOpen={onOpen}
          />
          <Txt style={{ fontFamily: font.semibold, fontSize: 12 }}>
            Операции прошлого периода
          </Txt>
          <TransactionEvidence
            transactions={change.previousTransactions}
            onOpen={onOpen}
          />
          <Txt style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
            У разделённой покупки показана только часть этой категории. Возвраты
            уменьшают расходы.
          </Txt>
        </View>
      )}
    </View>
  );
}

export function SpendingComparison({
  month,
  open,
  full = false,
}: {
  month: string;
  open: OpenSheet;
  full?: boolean;
}) {
  const { state, today } = useFinance();
  const { money } = useMoney();
  const comparison = spendingComparison(state, month, today);
  const difference = comparison.current - comparison.previous;
  return (
    <Card>
      <Section title="Что изменилось" />
      <View style={{ gap: 16 }}>
        {!comparison.hasHistory ? (
          <Notice>
            {comparison.days === 0
              ? "Этот месяц ещё не начался. Сравнение появится после записи операций."
              : `Для сравнения нужна история с ${dateLabel(comparison.previousStart)}. ${comparison.firstDate ? `Самая ранняя запись — ${dateLabel(comparison.firstDate)}.` : "Пока операций нет."} Можно импортировать выписку за прошлый месяц.`}
          </Notice>
        ) : (
          <>
            <Txt style={{ color: C.muted, fontSize: 12, lineHeight: 19 }}>
              С {dateLabel(comparison.currentStart)} по{" "}
              {dateLabel(comparison.currentEnd)} и с{" "}
              {dateLabel(comparison.previousStart)} по{" "}
              {dateLabel(comparison.previousEnd)} — одинаковое число дней:{" "}
              {comparison.days}.
            </Txt>
            <Notice>
              {difference === 0
                ? "Общие расходы не изменились."
                : `Общие расходы ${difference > 0 ? "выросли" : "снизились"} на ${money(Math.abs(difference))}.`}{" "}
              {comparison.previous > 0 &&
              comparison.current >= 0 &&
              difference !== 0
                ? `Это около ${Math.round((Math.abs(difference) / comparison.previous) * 100)}% к прошлому периоду. `
                : ""}
              Сравнение учитывает только записанные операции.
            </Notice>
            <RecordList
              items={comparison.changes}
              full={full}
              keyExtractor={(change) => `${month}-${change.categoryId}`}
              showAllLabel="Все изменения по категориям"
              onShowAll={() =>
                open({ type: "list", list: "spendingChanges", month })
              }
              testID="spending-changes-list"
              renderItem={(change) => (
                <CategoryChange
                  change={change}
                  onOpen={(id) => open({ type: "transaction", id })}
                />
              )}
            />
          </>
        )}
      </View>
    </Card>
  );
}
