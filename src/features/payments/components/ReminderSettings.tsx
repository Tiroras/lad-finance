import { useFinanceActions, useFinance } from "../../../state/finance";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { DEFAULT_REMINDERS } from "../../../domain/reminders";
import { requestReminderPermission } from "../../../infrastructure/notifications/notifications";
import { useReminders } from "../model/ReminderProvider";
import { ReminderQueueStatus } from "./ReminderQueueStatus";
import {
  Button,
  C,
  Card,
  Field,
  Notice,
  Section,
  Segments,
  Txt,
} from "../../../shared/ui";

export function ReminderSettings() {
  const { profile } = useFinance();
  if (Platform.OS === "web")
    return (
      <Notice>
        Напоминания работают в приложении Лад для iOS и Android. В браузере
        доступен календарь платежей.
      </Notice>
    );
  return <ReminderSettingsForm key={profile} />;
}

function ReminderSettingsForm() {
  const { state, activeProfile } = useFinance();
  const actions = useFinanceActions();
  const preferences = state.settings.reminders ?? DEFAULT_REMINDERS;
  const { result, error, updating, lastSuccessAt, retry } = useReminders();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [permissionFailure, setPermissionFailure] = useState(false);
  const [hour, setHour] = useState(String(preferences.hour));
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => setHour(String(preferences.hour)), [preferences.hour]);
  const change = (patch: Partial<typeof preferences>) => {
    try {
      actions.saveReminderPreferences(patch);
      setFailure("");
    } catch (cause) {
      setFailure(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить настройки.",
      );
    }
  };
  const toggle = async () => {
    setBusy(true);
    setFailure("");
    setPermissionFailure(false);
    try {
      if (preferences.enabled) change({ enabled: false });
      else {
        const allowed = await requestReminderPermission();
        if (!active.current) return;
        if (allowed) change({ enabled: true });
        else {
          setPermissionFailure(true);
          setFailure(
            "Уведомления не разрешены. Проверьте разрешение и канал напоминаний в настройках телефона.",
          );
        }
      }
    } catch {
      if (active.current)
        setFailure("Не удалось включить напоминания. Повторите попытку.");
    } finally {
      if (active.current) setBusy(false);
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
            }}
          />
        </>
      )}
      {!!failure && <Notice tone="warning">{failure}</Notice>}
      <ReminderQueueStatus
        profileName={activeProfile.name}
        result={result}
        error={error}
        updating={updating}
        lastSuccessAt={lastSuccessAt}
        retry={retry}
      />
      {(permissionFailure || result?.status === "denied") && (
        <View style={{ gap: 12 }}>
          <Button
            label="Настройки телефона"
            variant="secondary"
            onPress={() =>
              void Linking.openSettings().catch(() =>
                setFailure("Откройте системные настройки Лада вручную."),
              )
            }
          />
          <Button
            label="Проверить разрешение снова"
            variant="secondary"
            onPress={preferences.enabled ? retry : () => void toggle()}
            disabled={busy}
          />
        </View>
      )}
    </Card>
  );
}
