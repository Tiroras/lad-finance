import { useState } from "react";
import { View } from "react-native";
import { pickBackup, unlockBackup } from "../lib/backup";
import type { FinanceState } from "../../../domain/types";
import { ErrorText, Button, Card, Field, Notice } from "../../../shared/ui";

export function BackupPicker({
  label,
  onReady,
  onStart,
  disabled = false,
}: {
  label: string;
  onReady: (state: FinanceState) => void;
  onStart?: () => void;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState<string>();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть копию.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <Button
        label={label}
        icon="cloud-upload-outline"
        variant="secondary"
        disabled={busy || disabled}
        onPress={() =>
          void run(async () => {
            onStart?.();
            setRaw(undefined);
            setPassword("");
            const file = await pickBackup();
            if (file?.kind === "open") onReady(file.state);
            if (file?.kind === "encrypted") setRaw(file.raw);
          })
        }
      />
      {raw && (
        <Card style={{ gap: 14 }}>
          <Notice>
            Это копия с паролем. Введите пароль, заданный при её создании. Если
            он потерян, восстановить эту копию не получится.
          </Notice>
          <Field
            label="Пароль резервной копии"
            accessibilityLabel="Пароль для восстановления"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={256}
            editable={!busy}
          />
          <Button
            label={busy ? "Проверка пароля…" : "Открыть защищённую копию"}
            disabled={busy || !password}
            onPress={() =>
              void run(async () => {
                const state = await unlockBackup(raw, password);
                setPassword("");
                setRaw(undefined);
                onReady(state);
              })
            }
          />
          <Button
            label="Отмена ввода пароля"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setRaw(undefined);
              setPassword("");
              setError("");
            }}
          />
        </Card>
      )}
      <ErrorText error={error} />
    </View>
  );
}
