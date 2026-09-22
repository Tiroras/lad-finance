import { Pressable } from "react-native";
import { useFinanceStatus } from "../../state/finance";
import { C, Txt } from "../../shared/ui";
import { useReminders } from "../../features/payments";
import type { OpenSheet } from "../navigation/types";

export function AppStatusBanners({ open }: { open: OpenSheet }) {
  const reminders = useReminders();
  const { saveError, retrySave } = useFinanceStatus();
  return (
    <>
      {(!!reminders.error || reminders.result?.status === "denied") && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Проверить напоминания"
          onPress={() => open({ type: "settings" })}
          style={{ padding: 12, backgroundColor: "#F8E8DA" }}
        >
          <Txt style={{ color: C.red, fontSize: 12, textAlign: "center" }}>
            Напоминания требуют внимания. Откройте настройки.
          </Txt>
        </Pressable>
      )}
      {saveError && (
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
