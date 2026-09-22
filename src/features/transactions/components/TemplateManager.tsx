import { useState } from "react";
import type { TransactionTemplate } from "../../../domain/automation";
import { templateProblem } from "../../../domain/automation";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  Button,
  Card,
  DeleteButton,
  ErrorText,
  Field,
  Notice,
  Section,
  Txt,
} from "../../../shared/ui";
import {
  useFinance,
  useFinanceActions,
  useMoney,
} from "../../../state/finance";

function TemplateItem({ template }: { template: TransactionTemplate }) {
  const { state } = useFinance();
  const { money } = useMoney();
  const actions = useFinanceActions();
  const [name, setName] = useState(template.name);
  const { error, run } = useActionError();
  const problem = templateProblem(state, template);
  return (
    <Card style={{ gap: 10 }}>
      <Txt>
        {template.title} · {money(template.amount, true, template.currency)}
      </Txt>
      <Txt>{state.accounts.find((a) => a.id === template.accountId)?.name}</Txt>
      {!!problem && <Notice tone="warning">{problem}</Notice>}
      <Field
        label="Название шаблона"
        accessibilityLabel={`Название шаблона ${template.name}`}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Button
        label={`Переименовать «${template.name}»`}
        variant="secondary"
        onPress={() =>
          run(() => actions.saveTransactionTemplate({ ...template, name }))
        }
      />
      <DeleteButton
        explanation="Удалится только настройка. Записанные операции сохранятся."
        label={`Удалить шаблон «${template.name}»`}
        onDelete={() =>
          run(() => actions.deleteTransactionTemplate(template.id))
        }
      />
      <ErrorText error={error} />
    </Card>
  );
}
export function TemplateManager() {
  const { state } = useFinance();
  return (
    <>
      <Section title="Избранные шаблоны" />
      <Notice>
        Сохраните шаблон в форме операции. При выборе он заполняет черновик на
        сегодня. Проверьте сумму, валюту и дату перед добавлением. Изменить
        содержимое можно в черновике и нажать «Обновить шаблон».
      </Notice>
      {(state.transactionTemplates ?? []).map((template) => (
        <TemplateItem key={template.id} template={template} />
      ))}
      {!state.transactionTemplates?.length && <Txt>Шаблонов пока нет.</Txt>}
    </>
  );
}
