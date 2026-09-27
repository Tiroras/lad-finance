import { useState } from "react";
import { View } from "react-native";
import { useFinance, useFinanceStatus } from "../../../state/finance";
import { BackupPicker } from "./BackupPicker";
import type { FinanceState } from "../../../domain/types";
import type { LedgerProfile } from "../../../domain/profiles";
import { Notice } from "../../../shared/ui";
import { DataConfirmation } from "./DataConfirmation";

export function RecoveryControls({
  target,
  onRecovered,
}: {
  target?: LedgerProfile;
  onRecovered?: () => void;
}) {
  const { activeProfile } = useFinance();
  const { recover, switching } = useFinanceStatus();
  const destination = target ?? activeProfile;
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
        disabled={busy || switching}
        onReady={setPending}
        onStart={() => setPending(null)}
      />
      {pending && (
        <DataConfirmation
          title={`Восстановить профиль «${destination.name}»?`}
          confirmLabel="Подтвердить восстановление хранилища"
          cancelLabel="Отмена восстановления"
          busy={busy || switching}
          onConfirm={() =>
            void run(async () => {
              await recover(pending, target?.id);
              setPending(null);
              onRecovered?.();
            })
          }
          onCancel={() => setPending(null)}
        >
          Копия проверена: {pending.transactions.length} операций.
          Восстановление заменит данные профиля «{destination.name}» этой копией
          и создаст новый ключ шифрования на телефоне. Другие профили сохранят
          свои записи.
        </DataConfirmation>
      )}
      {!!error && <Notice tone="warning">{error}</Notice>}
    </View>
  );
}
