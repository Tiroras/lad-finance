import { useState } from "react";
import type { TransactionTemplate } from "../../../domain/automation";
import { templateProblem } from "../../../domain/automation";
import { Button, Card, Field, Notice, Txt } from "../../../shared/ui";
import { useFinance, useMoney } from "../../../state/finance";

export function TransactionTemplates({
  selectedId,
  onApply,
  onSave,
  embedded = false,
  name: controlledName,
  onNameChange,
}: {
  selectedId?: string;
  onApply: (template: TransactionTemplate) => void;
  onSave: (name: string, id?: string) => void;
  embedded?: boolean;
  name?: string;
  onNameChange?: (name: string) => void;
}) {
  const { state } = useFinance();
  const { money } = useMoney();
  const [expanded, setExpanded] = useState(false);
  const [localName, setLocalName] = useState("");
  const name = controlledName ?? localName;
  const selected = state.transactionTemplates?.find(
    (entry) => entry.id === selectedId,
  );
  return (
    <Card style={{ gap: 10 }}>
      {!embedded && (
        <Button
          label={expanded ? "Свернуть шаблоны" : "Избранные шаблоны"}
          variant="secondary"
          onPress={() => setExpanded(!expanded)}
        />
      )}
      {(embedded || expanded) && (
        <>
          {(state.transactionTemplates ?? []).map((template) => (
            <Button
              key={template.id}
              label={`${template.name} · ${money(template.amount, true, template.currency)}`}
              variant="secondary"
              onPress={() => onApply(template)}
            />
          ))}
          {!!selected && (
            <Notice>
              Выбран «{selected.name}».{" "}
              {templateProblem(state, selected) ??
                "Перед сохранением подтвердите сумму и дату."}
            </Notice>
          )}
          <Field
            label="Имя нового шаблона"
            accessibilityLabel="Имя нового шаблона"
            value={name}
            onChangeText={onNameChange ?? setLocalName}
            placeholder="Например, обед на работе"
            maxLength={120}
          />
          <Button
            label="Сохранить новый шаблон"
            variant="secondary"
            onPress={() => onSave(name)}
          />
          {!!selected && (
            <Button
              label="Обновить шаблон"
              variant="secondary"
              onPress={() => onSave(selected.name, selected.id)}
            />
          )}
          <Txt>Сохранение шаблона не добавляет операцию.</Txt>
        </>
      )}
    </Card>
  );
}
