import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { FinanceProfile } from "../../../domain/profiles";
import {
  getBackupReceiptStore,
  type BackupReceipt,
} from "../../../infrastructure/storage/backupReceipts";
import { ErrorText, Notice, Txt } from "../../../shared/ui";
import type { VerifiedBackup } from "../lib/backup";
import { BackupPicker } from "./BackupPicker";
import { BackupNewProfile } from "./BackupNewProfile";

export function BackupVerification({
  profile,
  receipt,
  disabled,
  onReceipt,
}: {
  profile: FinanceProfile;
  receipt?: BackupReceipt;
  disabled: boolean;
  onReceipt: (receipt: BackupReceipt) => void;
}) {
  const [backup, setBackup] = useState<VerifiedBackup>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const expectedExportId = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  return (
    <View style={{ gap: 14 }}>
      <Notice>
        «Проверить копию» читает файл и проверяет его содержимое. Учёт при этом
        не заменяется. Для проверки переноса можно затем восстановить файл в
        новый профиль.
      </Notice>
      <BackupPicker
        label="Проверить копию"
        disabled={disabled}
        onStart={() => {
          generation.current += 1;
          expectedExportId.current = receipt?.exportId;
          setBackup(undefined);
          setMessage("");
          setError("");
        }}
        onReady={(value) => {
          const reading = generation.current;
          setBackup(value);
          const exportId = expectedExportId.current;
          if (!exportId) {
            setMessage(
              "Файл читается. Для него нет отметки о последнем экспорте этого профиля.",
            );
            return;
          }
          void getBackupReceiptStore(profile)
            .verifyRead(exportId, value.fingerprint)
            .then((verified) => {
              if (reading !== generation.current) return;
              if (verified) {
                onReceipt(verified);
                setMessage("Последняя подготовленная копия проверена чтением.");
              } else
                setMessage(
                  "Файл читается, но это другая копия. Отметка о последнем экспорте не изменена.",
                );
            })
            .catch((failure) => {
              if (reading !== generation.current) return;
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Файл проверен, но отметку сохранить не удалось.",
              );
            });
        }}
      />
      {backup && (
        <>
          <Txt>
            Копия проверена: {backup.candidate.state.transactions.length}{" "}
            операций, {backup.candidate.state.accounts.length} счетов,{" "}
            {backup.candidate.state.goals.length} целей. Файл: {backup.name}.
          </Txt>
          {!!message && <Notice>{message}</Notice>}
          <BackupNewProfile
            key={backup.fingerprint.sha256}
            backup={backup}
            disabled={disabled}
          />
        </>
      )}
      <ErrorText error={error} />
    </View>
  );
}
