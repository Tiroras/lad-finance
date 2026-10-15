import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  pickBackup,
  type EncryptedBackup,
  type VerifiedBackup,
} from "../lib/backup";
import { DEMO_ENABLED } from "../../../shared/lib/buildOptions";
import { ErrorText, Button, Card, Field, Notice } from "../../../shared/ui";

export function BackupPicker({
  label,
  onReady,
  onStart,
  disabled = false,
}: {
  label: string;
  onReady: (backup: VerifiedBackup) => void;
  onStart?: () => void;
  disabled?: boolean;
}) {
  const [selection, setSelection] = useState<EncryptedBackup>();
  const selected = useRef<EncryptedBackup | undefined>(undefined);
  const mounted = useRef(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      try {
        selected.current?.close();
      } catch {
        /* No UI remains for a cache cleanup error. */
      }
      selected.current = undefined;
    };
  }, []);
  const clear = () => {
    try {
      selected.current?.close();
    } finally {
      selected.current = undefined;
      setSelection(undefined);
      setPassword("");
    }
  };
  const acceptBackup = (backup: VerifiedBackup) => {
    if (backup.candidate.sourceDemo && !DEMO_ENABLED)
      throw new Error(
        "В этой копии сохранён демонстрационный учёт. Эта версия приложения поддерживает только личный учёт. Выберите копию своих данных.",
      );
    onReady(backup);
  };
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Не удалось открыть копию.");
    } finally {
      if (mounted.current) setBusy(false);
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
            clear();
            const file = await pickBackup();
            if (!mounted.current) {
              if (file?.kind === "encrypted") file.selection.close();
              return;
            }
            if (file?.kind === "open") acceptBackup(file.backup);
            if (file?.kind === "encrypted") {
              selected.current = file.selection;
              setSelection(file.selection);
            }
          })
        }
      />
      {selection && (
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
            editable={!busy && !disabled}
          />
          <Button
            label={busy ? "Проверка пароля…" : "Открыть защищённую копию"}
            disabled={busy || disabled || !password}
            onPress={() =>
              void run(async () => {
                const backup = await selection.unlock(password);
                if (!mounted.current) return;
                clear();
                acceptBackup(backup);
              })
            }
          />
          <Button
            label="Отмена ввода пароля"
            variant="secondary"
            disabled={busy || disabled}
            onPress={() =>
              void run(async () => {
                clear();
              })
            }
          />
        </Card>
      )}
      <ErrorText error={error} />
    </View>
  );
}
