import { Pressable } from "react-native";
import { useFinanceStatus } from "../../state/finance";
import { C, Txt } from "../../shared/ui";
import { useReminders } from "../../features/payments";
import type { OpenSheet } from "../navigation/types";

export function AppStatusBanners({ open }: { open: OpenSheet }) {
  const reminders = useReminders();
  const { saveError, retrySave, pendingImportId, busyImportId } =
    useFinanceStatus();
  return (
    <>
      {(!!reminders.error || reminders.result?.status === "denied") && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Проверить напоминания"
          onPress={() => open({ type: "reminderSettings" })}
          style={{ padding: 12, backgroundColor: "#F8E8DA" }}
        >
          <Txt style={{ color: C.red, fontSize: 12, textAlign: "center" }}>
            Напоминания требуют внимания. Откройте настройки.
          </Txt>
        </Pressable>
      )}
      {pendingImportId && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть неподтверждённый результат импорта"
          onPress={() => open({ type: "importResult", id: pendingImportId })}
          style={{ padding: 12, backgroundColor: "#F8E8DA" }}
        >
          <Txt
            accessibilityRole="alert"
            style={{ color: C.red, fontSize: 12, textAlign: "center" }}
          >
            {busyImportId === pendingImportId
              ? "Импорт сохраняется. Открыть результат."
              : "Запись импорта не подтверждена. Откройте результат, чтобы продолжить."}
          </Txt>
        </Pressable>
      )}
      {saveError && !pendingImportId && (
        <Pressable
          accessibilityRole="button"
          onPress={retrySave}
          style={{ padding: 12, backgroundColor: "#F8E8DA" }}
        >
          <Txt
            accessibilityRole="alert"
            style={{ color: C.red, fontSize: 12, textAlign: "center" }}
          >
            Не удалось сохранить изменения. Нажмите, чтобы повторить. Можно
            экспортировать копию в настройках.
          </Txt>
        </Pressable>
      )}
    </>
  );
}
