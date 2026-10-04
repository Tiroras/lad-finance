import { Keyboard, Pressable, View } from "react-native";
import type { CurrencyCode } from "../../../domain/currency";
import {
  C,
  Field,
  font,
  Icon,
  interactionStyles,
  Txt,
} from "../../../shared/ui";
import type { TransactionDraft } from "../model/transactionDraft";
import { CategoryRuleSuggestion } from "./CategoryRuleSuggestion";
import { TransactionSplits } from "./TransactionSplits";

export function TransactionDetails({
  draft,
  currency,
  total,
  expanded,
  onExpandedChange,
  onChange,
  onToggleSplits,
}: {
  draft: TransactionDraft;
  currency: CurrencyCode;
  total: number | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (values: Partial<TransactionDraft>) => void;
  onToggleSplits: () => void;
}) {
  const expense = draft.type === "expense";
  const split = expense && draft.splitEnabled;
  const label = expense ? "Заметка и разделение покупки" : "Заметка";
  return (
    <View style={{ gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${!expanded && draft.note.trim() ? ", заметка заполнена" : ""}, дополнительные поля операции`}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => {
          Keyboard.dismiss();
          onExpandedChange(!expanded);
        }}
        style={({ pressed }) => [
          {
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 10,
          },
          pressed && interactionStyles.pressed,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Txt
            style={{ color: C.green, fontFamily: font.semibold, fontSize: 13 }}
          >
            {label}
          </Txt>
          {!!draft.note.trim() && !expanded && (
            <Txt numberOfLines={2} style={{ color: C.muted, fontSize: 12 }}>
              Заметка: {draft.note.trim()}
            </Txt>
          )}
        </View>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          color={C.muted}
          size={18}
        />
      </Pressable>
      {expanded && (
        <Field
          label="Заметка · необязательно"
          accessibilityLabel="Заметка"
          placeholder="Что хочется запомнить?"
          value={draft.note}
          onChangeText={(note) => onChange({ note })}
          maxLength={500}
          multiline
        />
      )}
      {expense && (expanded || split) && (
        <TransactionSplits
          enabled={split}
          parts={draft.parts}
          currency={currency}
          total={total}
          onChange={(parts) => onChange({ parts })}
          onToggle={onToggleSplits}
        />
      )}
      {expanded && expense && !split && (
        <CategoryRuleSuggestion title={draft.title} category={draft.category} />
      )}
    </View>
  );
}
