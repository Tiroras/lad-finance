import { useState } from "react";
import { View } from "react-native";
import type { VerifiedBackup } from "../lib/backup";
import { uid } from "../../../domain/finance";
import type { FinanceProfile } from "../../../domain/profiles";
import {
  useFinance,
  useFinanceActions,
  useFinanceStatus,
} from "../../../state/finance";
import { useActionError } from "../../../shared/lib/useActionError";
import { Button, C, ErrorText, Notice } from "../../../shared/ui";
import { BackupNewProfile } from "./BackupNewProfile";
import { BackupSettings } from "./BackupSettings";
import { DataConfirmation } from "./DataConfirmation";

type Confirmation =
  | {
      type: "restore";
      backup: VerifiedBackup;
      operationId: string;
      profileId: FinanceProfile;
      profileName: string;
    }
  | { type: "reset"; demo: boolean }
  | null;

export function DataManagement({ close }: { close: () => void }) {
  const { state, notify, profile, activeProfile } = useFinance();
  const { switching, financeWriteBlocked } = useFinanceStatus();
  const actions = useFinanceActions();
  const { error, setError } = useActionError();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [restoring, setRestoring] = useState(false);
  const blocked = switching || financeWriteBlocked || restoring;
  const cancel = () => {
    setConfirmation(null);
    setError("");
  };
  const requestReset = (demo: boolean) => {
    setError("");
    setConfirmation({ type: "reset", demo });
  };
  const confirmRestore = async () => {
    if (confirmation?.type !== "restore" || blocked) return;
    setRestoring(true);
    setError("");
    try {
      await actions.restoreConfirmed({
        operationId: confirmation.operationId,
        expectedProfileId: confirmation.profileId,
        candidate: confirmation.backup.candidate,
        format: confirmation.backup.format,
      });
      setConfirmation(null);
    } catch (failure) {
      // A rejected pre-application attempt can be explicitly retried against a new context.
      setConfirmation((current) =>
        current?.type === "restore" &&
        current.operationId === confirmation.operationId
          ? { ...current, operationId: uid() }
          : current,
      );
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось восстановить копию.",
      );
    } finally {
      setRestoring(false);
    }
  };
  const confirmReset = async () => {
    if (confirmation?.type !== "reset" || blocked) return;
    setRestoring(true);
    setError("");
    try {
      await actions.reset(confirmation.demo);
      notify(
        confirmation.demo
          ? "Демонстрационные данные загружены"
          : "Всё готово для вашего первого шага",
      );
      close();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось очистить учёт.",
      );
    } finally {
      setRestoring(false);
    }
  };
  return (
    <>
      <BackupSettings
        key={profile}
        disabled={blocked}
        onStart={cancel}
        onReady={(backup) =>
          setConfirmation({
            type: "restore",
            backup,
            operationId: uid(),
            profileId: profile,
            profileName: activeProfile.name,
          })
        }
      />
      {confirmation?.type === "restore" &&
        !confirmation.backup.candidate.requiresRescue && (
          <DataConfirmation
            title={`Копия проверена для профиля «${confirmation.profileName}»`}
            confirmLabel="Заменить данные этой копией"
            cancelLabel="Отмена восстановления"
            busy={blocked}
            onCancel={cancel}
            onConfirm={() => void confirmRestore()}
          >
            В файле {confirmation.backup.candidate.state.transactions.length}{" "}
            операций, {confirmation.backup.candidate.state.accounts.length}{" "}
            счетов, {confirmation.backup.candidate.state.goals.length} целей и{" "}
            {confirmation.backup.candidate.state.scenarios?.length ?? 0}{" "}
            сценариев. Восстановление заменит данные текущего профиля. Сначала
            экспортируйте их, если хотите сохранить.
          </DataConfirmation>
        )}
      {confirmation?.type === "restore" && (
        <>
          {confirmation.backup.candidate.requiresRescue && (
            <Notice>
              Большая копия проверена. Для сохранности исходного учёта
              восстановите её в новый профиль.
            </Notice>
          )}
          <BackupNewProfile
            key={confirmation.backup.fingerprint.sha256}
            backup={confirmation.backup}
            disabled={blocked}
          />
        </>
      )}
      <View
        style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }}
      />
      <Button
        label={state.demo ? "Обновить пример" : "Очистить учёт"}
        variant="danger"
        disabled={blocked}
        onPress={() => requestReset(state.demo)}
      />
      {confirmation?.type === "reset" && (
        <DataConfirmation
          title={
            confirmation.demo ? "Обновить пример?" : "Начать с чистого листа?"
          }
          confirmLabel={
            confirmation.demo
              ? "Да, обновить пример"
              : "Да, начать с пустых счетов"
          }
          onCancel={cancel}
          busy={blocked}
          onConfirm={() => void confirmReset()}
        >
          Операции, категории, цели, платежи, сценарии и остатки текущего
          профиля будут заменены. При необходимости сначала экспортируйте
          резервную копию.
        </DataConfirmation>
      )}
      <ErrorText error={error} />
    </>
  );
}
