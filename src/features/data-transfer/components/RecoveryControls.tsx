import { useState } from "react";
import { View } from "react-native";
import { useFinance, useFinanceStatus } from "../../../state/finance";
import { BackupPicker } from "./BackupPicker";
import type { VerifiedBackup } from "../lib/backup";
import { BackupNewProfile } from "./BackupNewProfile";
import type { LedgerProfile } from "../../../domain/profiles";
import { uid } from "../../../domain/finance";
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
  const [pending, setPending] = useState<VerifiedBackup | null>(null);
  const [operationId, setOperationId] = useState(uid);
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
        onReady={(backup) => {
          setPending(backup);
          setOperationId(uid());
        }}
        onStart={() => setPending(null)}
      />
      {pending && !pending.candidate.requiresRescue && (
        <DataConfirmation
          title={`Восстановить профиль «${destination.name}»?`}
          confirmLabel="Подтвердить восстановление хранилища"
          cancelLabel="Отмена восстановления"
          busy={busy || switching}
          onConfirm={() =>
            void run(async () => {
              const result = await recover(
                pending.candidate.state,
                target?.id,
                {
                  operationId,
                  format: pending.format,
                  sourceDemo: pending.candidate.sourceDemo,
                },
              );
              if (result?.status !== "confirmed") return;
              setPending(null);
              onRecovered?.();
            })
          }
          onCancel={() => setPending(null)}
        >
          Копия проверена: {pending.candidate.state.transactions.length}{" "}
          операций. Восстановление заменит данные профиля «{destination.name}»
          этой копией и создаст новый ключ шифрования на телефоне. Другие
          профили сохранят свои записи.
        </DataConfirmation>
      )}
      {pending && (
        <>
          {pending.candidate.requiresRescue && (
            <Notice>
              Большой архив восстанавливается только в новый профиль.
            </Notice>
          )}
          <BackupNewProfile
            key={pending.fingerprint.sha256}
            backup={pending}
            onRestored={onRecovered}
          />
        </>
      )}
      {!!error && <Notice tone="warning">{error}</Notice>}
    </View>
  );
}
