import { useState } from "react";
import { View } from "react-native";
import { useFinanceStatus } from "../../../state/finance";
import { Button, ErrorText, Field, Notice } from "../../../shared/ui";
import type { VerifiedBackup } from "../lib/backup";
import { BackupPicker } from "./BackupPicker";
import { DataConfirmation } from "./DataConfirmation";

export function BackupNewProfile({
  backup,
  defaultName = "",
  onRestored,
  disabled = false,
}: {
  backup?: VerifiedBackup;
  defaultName?: string;
  onRestored?: () => void;
  disabled?: boolean;
}) {
  const { restoreBackupToNewProfile, switching } = useFinanceStatus();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<VerifiedBackup>();
  const [name, setName] = useState(defaultName);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = backup ?? picked;
  const blocked = busy || switching || disabled;
  return (
    <View style={{ gap: 14 }}>
      <Button
        label="Восстановить в новый профиль"
        variant="secondary"
        disabled={blocked}
        onPress={() => {
          setOpen(!open);
          setConfirm(false);
          setError("");
        }}
      />
      {open && (
        <>
          <Notice>
            Копия будет записана в отдельный личный профиль. Существующие
            профили сохранятся. Название профиля хранится без шифрования;
            используйте нейтральное имя.
          </Notice>
          {!backup && (
            <BackupPicker
              label="Выбрать копию для нового профиля"
              disabled={blocked}
              onReady={setPicked}
              onStart={() => {
                setPicked(undefined);
                setConfirm(false);
              }}
            />
          )}
          <Field
            label="Название нового профиля"
            accessibilityLabel="Название нового профиля"
            value={name}
            maxLength={40}
            onChangeText={(value) => {
              setName(value);
              setConfirm(false);
            }}
            editable={!blocked}
          />
          {selected && (
            <Button
              label="Подготовить восстановление в новый профиль"
              disabled={blocked || !name.trim()}
              onPress={() => setConfirm(true)}
            />
          )}
          {confirm && selected && (
            <DataConfirmation
              title={`Создать профиль «${name.trim()}» из копии?`}
              confirmLabel="Подтвердить создание профиля из копии"
              busy={blocked}
              onCancel={() => setConfirm(false)}
              onConfirm={() => {
                void (async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await restoreBackupToNewProfile({
                      name,
                      candidate: selected.candidate,
                      resultMetadata: { format: selected.format },
                    });
                    setConfirm(false);
                    setPicked(undefined);
                    setOpen(false);
                    onRestored?.();
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "Не удалось восстановить новый профиль.",
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              В файле {selected.candidate.state.transactions.length} операций,{" "}
              {selected.candidate.state.accounts.length} счетов и{" "}
              {selected.candidate.state.goals.length} целей. После проверки
              записи откроется новый профиль. Проверьте его данные перед
              удалением исходной копии.
            </DataConfirmation>
          )}
        </>
      )}
      <ErrorText error={error} />
    </View>
  );
}
