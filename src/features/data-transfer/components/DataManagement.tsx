import { useState } from "react";
import { View } from "react-native";
import type { FinanceState } from "../../../domain/types";
import {
  useFinance,
  useFinanceActions,
  useFinanceStatus,
} from "../../../state/finance";
import { useActionError } from "../../../shared/lib/useActionError";
import { Button, C, ErrorText } from "../../../shared/ui";
import { BackupSettings } from "./BackupSettings";
import { DataConfirmation } from "./DataConfirmation";

type Confirmation =
  | { type: "restore"; state: FinanceState }
  | { type: "reset"; demo: boolean }
  | null;

export function DataManagement({ close }: { close: () => void }) {
  const { state, notify } = useFinance();
  const { switching } = useFinanceStatus();
  const actions = useFinanceActions();
  const { error, setError, run } = useActionError();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const cancel = () => {
    setConfirmation(null);
    setError("");
  };
  const requestReset = (demo: boolean) => {
    setError("");
    setConfirmation({ type: "reset", demo });
  };
  return (
    <>
      <BackupSettings
        disabled={switching}
        onStart={cancel}
        onReady={(value) => setConfirmation({ type: "restore", state: value })}
      />
      {confirmation?.type === "restore" && (
        <DataConfirmation
          title="Копия проверена"
          confirmLabel="Заменить данные этой копией"
          cancelLabel="Отмена восстановления"
          busy={switching}
          onCancel={cancel}
          onConfirm={() =>
            run(() => {
              actions.restore(confirmation.state);
              notify("Данные восстановлены");
              close();
            })
          }
        >
          В файле {confirmation.state.transactions.length} операций,{" "}
          {confirmation.state.accounts.length} счетов,{" "}
          {confirmation.state.goals.length} целей и{" "}
          {confirmation.state.scenarios?.length ?? 0} сценариев. Восстановление
          заменит данные текущего профиля. Сначала экспортируйте их, если хотите
          сохранить.
        </DataConfirmation>
      )}
      <View
        style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }}
      />
      <Button
        label={state.demo ? "Обновить пример" : "Очистить учёт"}
        variant="danger"
        disabled={switching}
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
          busy={switching}
          onConfirm={() =>
            run(() => {
              actions.reset(confirmation.demo);
              notify(
                confirmation.demo
                  ? "Демонстрационные данные загружены"
                  : "Всё готово для вашего первого шага",
              );
              close();
            })
          }
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
