import { useState } from "react";
import { View } from "react-native";
import { useFinance } from "../store";
import { BackupPicker } from "../features/export/BackupPicker";
import type { FinanceState } from "../domain/types";
import { Button, Card, Notice, Txt } from "../ui";

export function RecoveryControls() {
  const { recover } = useFinance();
  const [pending, setPending] = useState<FinanceState | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось восстановить данные.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 15, marginTop: 20, maxWidth: 380 }}>
      <BackupPicker
        label="Выбрать копию для восстановления"
        disabled={busy}
        onReady={setPending}
        onStart={() => setPending(null)}
      />
      {pending && (
        <Card style={{ gap: 14 }}>
          <Txt>
            Копия проверена: {pending.transactions.length} операций.
            Восстановление заменит недоступное хранилище этой копией и создаст
            новый ключ шифрования на телефоне.
          </Txt>
          <Button
            label="Подтвердить восстановление хранилища"
            disabled={busy}
            onPress={() => void run(async () => recover(pending))}
          />
          <Button
            label="Отмена восстановления"
            variant="secondary"
            disabled={busy}
            onPress={() => setPending(null)}
          />
        </Card>
      )}
      {!!error && <Notice tone="warning">{error}</Notice>}
    </View>
  );
}
