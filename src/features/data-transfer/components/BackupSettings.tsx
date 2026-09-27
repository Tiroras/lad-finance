import { useEffect, useState } from "react";
import { View } from "react-native";
import { exportBackup } from "../lib/backup";
import {
  dateLabel,
  localDate,
  shiftDate,
  validDate,
} from "../../../domain/finance";
import type { FinanceState } from "../../../domain/types";
import {
  ErrorText,
  Button,
  Card,
  Field,
  Notice,
  Txt,
} from "../../../shared/ui";
import { validateBackupPassword } from "../../../infrastructure/crypto/passwordBackup";
import {
  readLastBackupDate,
  writeLastBackupDate,
} from "../../../infrastructure/storage/backupHistory";
import { useFinance } from "../../../state/finance";
import { BackupPicker } from "./BackupPicker";

export function BackupSettings({
  onReady,
  onStart,
  disabled = false,
}: {
  onReady: (state: FinanceState) => void;
  onStart: () => void;
  disabled?: boolean;
}) {
  const { state, notify, today, profile } = useFinance();
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [protect, setProtect] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [last, setLast] = useState<string>();
  useEffect(() => {
    let active = true;
    setLast(undefined);
    void readLastBackupDate(profile)
      .then((value) => {
        if (active && value && validDate(value)) setLast(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile]);
  const save = async (encrypted: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (encrypted) {
        validateBackupPassword(password);
        if (password !== confirmation) throw new Error("Пароли не совпадают.");
      }
      await exportBackup(state, encrypted ? password : undefined);
      setPassword("");
      setConfirmation("");
      setProtect(false);
      const date = localDate();
      setLast(date);
      await writeLastBackupDate(profile, date).catch(() => {});
      notify("Резервная копия подготовлена. Сохраните файл в выбранном месте.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось подготовить копию.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Notice>
        Полная копия включает счета, операции, категории, цели, платежи и
        сценарии. Сохраните её вне приложения перед сменой устройства.
      </Notice>
      <Txt>
        {last
          ? `Последняя подготовленная копия: ${dateLabel(last)}. Убедитесь, что файл сохранён.`
          : "Копия на этом устройстве ещё не создавалась."}
      </Txt>
      {last && last < shiftDate(today, -30) && (
        <Notice>
          С последней подготовки копии прошло больше месяца. Создайте новую,
          чтобы сохранить свежие записи.
        </Notice>
      )}
      <Button
        label="Создать копию с паролем"
        icon="lock-closed-outline"
        variant="secondary"
        disabled={busy || disabled}
        onPress={() => setProtect(!protect)}
      />
      {protect && (
        <Card style={{ gap: 14 }}>
          <Notice>
            Придумайте отдельный пароль от 10 символов. Он нужен для
            восстановления на любом устройстве; приложение не хранит и не
            восстанавливает его.
          </Notice>
          <Field
            label="Пароль копии"
            accessibilityLabel="Новый пароль копии"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={256}
            editable={!busy && !disabled}
          />
          <Field
            label="Повторите пароль"
            accessibilityLabel="Повтор пароля копии"
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={256}
            editable={!busy && !disabled}
          />
          <Button
            label={busy ? "Защищаем копию…" : "Сохранить защищённую копию"}
            disabled={busy || disabled}
            onPress={() => void save(true)}
          />
        </Card>
      )}
      <Txt>
        Обычная JSON-копия остаётся доступной без пароля. Не публикуйте её: в
        ней содержится весь учёт в открытом виде.
      </Txt>
      <Button
        label="Экспортировать резервную копию"
        icon="download-outline"
        variant="secondary"
        disabled={busy || disabled}
        onPress={() => void save(false)}
      />
      <ErrorText error={error} />
      <BackupPicker
        label="Восстановить из файла"
        disabled={busy || disabled}
        onStart={onStart}
        onReady={onReady}
      />
    </View>
  );
}
