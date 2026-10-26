import { useState } from "react";
import type { CategoryRule } from "../../../domain/automation";
import { useActionError } from "../../../shared/lib/useActionError";
import { usePreventSheetDismiss } from "../../../shared/ui/SheetDismissal";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Segments,
  Txt,
} from "../../../shared/ui";
import { useFinance, useFinanceActions } from "../../../state/finance";
import { CategoryPicker } from "../../categories";

export function CategoryRuleEditor({
  rule,
  done,
}: {
  rule?: CategoryRule;
  done: () => void;
}) {
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [match, setMatch] = useState<CategoryRule["match"]>(
    rule?.match ?? "exact",
  );
  const [category, setCategory] = useState(rule?.category ?? "other");
  usePreventSheetDismiss({
    hasChanges: () =>
      pattern.trim() !== (rule?.pattern ?? "") ||
      match !== (rule?.match ?? "exact") ||
      category !== (rule?.category ?? "other"),
    description: "Несохранённые изменения правила будут потеряны.",
  });
  const actions = useFinanceActions();
  const { notify } = useFinance();
  const { error, run } = useActionError();
  return (
    <Card style={{ gap: 12 }}>
      <Txt>{rule ? "Изменить правило" : "Новое правило для расходов"}</Txt>
      <Field
        label="Текст в названии операции"
        accessibilityLabel="Условие правила"
        value={pattern}
        onChangeText={setPattern}
        maxLength={120}
      />
      <Segments
        value={match}
        onChange={setMatch}
        options={[
          { value: "exact", label: "Совпадает" },
          { value: "contains", label: "Содержит" },
        ]}
      />
      <CategoryPicker
        value={category}
        onChange={setCategory}
        variant="select"
      />
      <ErrorText error={error} />
      <Button
        label="Сохранить правило"
        onPress={() =>
          run(() => {
            actions.saveCategoryRule({
              id: rule?.id,
              pattern,
              match,
              category,
              enabled: rule?.enabled ?? true,
            });
            notify("Правило сохранено. История операций не изменена.");
            done();
          })
        }
      />
      <Button label="Отмена" variant="secondary" onPress={done} />
    </Card>
  );
}
