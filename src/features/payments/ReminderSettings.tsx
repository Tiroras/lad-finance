import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useFinance } from "../../store";
import { DEFAULT_REMINDERS } from "../../domain/reminders";
import { requestReminderPermission } from "../../services/notifications";
import { useReminders } from "./ReminderProvider";
import {
  Button,
  C,
  Card,
  Field,
  Notice,
  Section,
  Segments,
  Txt,
} from "../../ui";

export function ReminderSettings() {
  const { state, update } = useFinance();
  const preferences = state.settings.reminders ?? DEFAULT_REMINDERS;
  const { result, error, retry } = useReminders();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [hour, setHour] = useState(String(preferences.hour));
  const change = (patch: Partial<typeof preferences>) =>
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        reminders: { ...(s.settings.reminders ?? DEFAULT_REMINDERS), ...patch },
      },
    }));
  if (Platform.OS === "web")
    return (
      <Notice>
        Напоминания работают в приложении Лад для iOS и Android. В браузере
        доступен календарь платежей.
      </Notice>
    );
  const toggle = async () => {
    setBusy(true);
    setFailure("");
    try {
      if (preferences.enabled) change({ enabled: false });
      else if (await requestReminderPermission()) change({ enabled: true });
      else
        setFailure(
          "Уведомления не разрешены. Включите их в настройках телефона и повторите попытку.",
        );
    } catch {
      setFailure("Не удалось включить напоминания. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 14 }}>
      <Section title="Напоминания о платежах" />
      <Txt style={{ fontSize: 12, lineHeight: 20, color: C.muted }}>
        Локальные уведомления без сервера. Суммы и названия платежей скрыты на
        экране блокировки.
      </Txt>
      <Button
        label={
          preferences.enabled ? "Выключить напоминания" : "Включить напоминания"
        }
        variant="secondary"
        disabled={busy}
        onPress={() => void toggle()}
      />
      {preferences.enabled && (
        <>
          <Segments
            value={String(preferences.daysBefore) as "0" | "1" | "3"}
            options={[
              { value: "0", label: "В день" },
              { value: "1", label: "За день" },
              { value: "3", label: "За 3 дня" },
            ]}
            onChange={(value) =>
              change({ daysBefore: Number(value) as 0 | 1 | 3 })
            }
          />
          <Field
            label="Час уведомления · местное время, 0–23"
            accessibilityLabel="Час напоминания"
            value={hour}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={setHour}
          />
          <Button
            label="Сохранить время"
            variant="secondary"
            onPress={() => {
              if (!/^\d{1,2}$/.test(hour) || Number(hour) > 23) {
                setFailure("Введите час от 0 до 23.");
                return;
              }
              change({ hour: Number(hour) });
              setFailure("");
            }}
          />
          {result?.status === "ready" && (
            <Txt style={{ fontSize: 11, color: C.muted }}>
              В очереди: {result.count}. Планируем ближайшие 60 уведомлений на
              срок до 60 дней и обновляем при открытии приложения. О просрочках
              напомним раз в день в течение недели.
              {result.truncated
                ? " Часть дат будет добавлена при следующих открытиях."
                : ""}
            </Txt>
          )}
        </>
      )}
      {(!!failure || result?.status === "denied") && (
        <View style={{ gap: 12 }}>
          <Notice tone="warning">
            {failure || "Разрешение на уведомления отключено в системе."}
          </Notice>
          <Button
            label="Настройки телефона"
            variant="secondary"
            onPress={() =>
              void Linking.openSettings().catch(() =>
                setFailure("Откройте системные настройки Лада вручную."),
              )
            }
          />
        </View>
      )}
      {!!error && (
        <>
          <Notice tone="warning">{error}</Notice>
          <Button label="Повторить настройку напоминаний" onPress={retry} />
        </>
      )}
    </Card>
  );
}
