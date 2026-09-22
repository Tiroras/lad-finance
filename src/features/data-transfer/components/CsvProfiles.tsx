import { useState } from "react";
import type { CsvSourceProfile } from "../../../domain/automation";
import { useActionError } from "../../../shared/lib/useActionError";
import {
  Button,
  Card,
  DeleteButton,
  ErrorText,
  Field,
  Notice,
  Txt,
} from "../../../shared/ui";
import { useFinance, useFinanceActions } from "../../../state/finance";

export function CsvProfiles({
  selectedId,
  canSave,
  onApply,
  onSave,
}: {
  selectedId?: string;
  canSave: boolean;
  onApply: (profile: CsvSourceProfile) => void;
  onSave: (name: string, id?: string) => void;
}) {
  const { state } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const profiles = state.csvProfiles ?? [];
  const selected = profiles.find((profile) => profile.id === selectedId);
  return (
    <Card style={{ gap: 12 }}>
      <Button
        label={expanded ? "Свернуть профили CSV" : "Профили CSV"}
        variant="secondary"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <>
          <Notice>
            Выберите профиль источника вручную: одинаковые колонки могут быть у
            разных счетов. Профиль запоминает настройки, но не содержимое
            выписки. После применения проверьте операции.
          </Notice>
          {profiles.map((profile) => (
            <Card key={profile.id} style={{ gap: 10 }}>
              <Button
                label={`Применить профиль «${profile.name}»`}
                variant="secondary"
                onPress={() => onApply(profile)}
              />
              <Txt>
                {
                  state.accounts.find(
                    (account) => account.id === profile.options.accountId,
                  )?.name
                }{" "}
                · {profile.currency}
              </Txt>
              <DeleteButton
                label={`Удалить профиль «${profile.name}»`}
                explanation="Будут удалены только настройки профиля. Операции сохранятся."
                onDelete={() => run(() => actions.deleteCsvProfile(profile.id))}
              />
            </Card>
          ))}
          {canSave && (
            <>
              <Field
                label="Название нового профиля"
                accessibilityLabel="Название профиля CSV"
                placeholder="Например, основной счёт банка"
                value={name}
                onChangeText={setName}
                maxLength={120}
              />
              <Button
                label="Сохранить профиль CSV"
                variant="secondary"
                onPress={() => onSave(name)}
              />
              {!!selected && (
                <Button
                  label={`Обновить профиль «${selected.name}»`}
                  variant="secondary"
                  onPress={() => onSave(selected.name, selected.id)}
                />
              )}
            </>
          )}
          <ErrorText error={error} />
        </>
      )}
    </Card>
  );
}
